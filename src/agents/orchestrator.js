"use strict";

function makeAgentOrchestrator({
  helpers,
  tutorialClips,
  createCheckout,
  getOrderStatus,
  evaluateSettlementPolicy,
  getAgentIdentity
}) {
  const sessions = new Map();

  function appendEvent(session, event) {
    session.trace.push({
      id: helpers.makeId("evt"),
      at: helpers.nowIso(),
      ...event
    });
  }

  function buildSummary(session) {
    const last = session.trace[session.trace.length - 1];
    if (!last) {
      return "No agent actions yet.";
    }
    if (last.kind === "error") {
      return `Agent flow failed: ${last.message}`;
    }
    return `Completed intent "${session.intent}" with ${session.trace.length} trace events.`;
  }

  function fanAgentForTip(context) {
    const dancerId = context?.dancer_id || "dancer-1";
    const amountMinor = Number(context?.amount_minor || 25);
    return {
      action: "propose_tip",
      dancer_id: dancerId,
      quantity: Math.max(1, Math.ceil(amountMinor / 100))
    };
  }

  function dancerAgentForBattle(context) {
    return {
      action: "confirm_battle_entry",
      dancer_name: context?.dancer_name || "Guest Dancer",
      wallet: context?.wallet || "0x0000000000000000000000000000000000000000"
    };
  }

  function paymentsAgentCheckout(itemId, quantity, context) {
    const previewAmountMinor = (tutorialClips.find((clip) => clip.id === itemId)?.priceMinor || 100) * quantity;
    const settlement =
      typeof evaluateSettlementPolicy === "function"
        ? evaluateSettlementPolicy({
            agentId: "payments-agent",
            amountMinor: previewAmountMinor,
            intent: context?.intent || "unknown"
          })
        : null;
    if (settlement && !settlement.approved) {
      const policyError = new Error(`Settlement policy blocked checkout: ${settlement.reasons.join(", ")}`);
      policyError.code = "settlement_policy_blocked";
      throw policyError;
    }

    const checkoutRequest = {
      currency: "USD",
      line_items: [{ item: { id: itemId }, quantity }],
      payment: {
        instruments: [
          {
            id: "agent-instrument-1",
            handler_id: "agentic",
            type: "wallet",
            brand: "demo",
            last_digits: "0000"
          }
        ],
        selected_instrument_id: "agent-instrument-1"
      },
      metadata: {
        session_hint: String(context?.session_hint || "")
      }
    };
    const checkout = createCheckout(checkoutRequest);
    return {
      checkout,
      settlement
    };
  }

  function resolveItemId(intent, context) {
    if (intent === "unlock_clip") {
      return context?.clip_id || "clip-1";
    }
    if (intent === "battle_entry") {
      return context?.clip_id || "clip-2";
    }
    return context?.clip_id || "clip-1";
  }

  function runSession(intent, context) {
    const identity = typeof getAgentIdentity === "function" ? getAgentIdentity() : null;
    const session = {
      id: helpers.makeId("agent-session"),
      intent,
      context: context || {},
      identity,
      created_at: helpers.nowIso(),
      updated_at: helpers.nowIso(),
      trace: [],
      status: "running"
    };
    sessions.set(session.id, session);
    appendEvent(session, { kind: "orchestrator", message: "Session started." });
    if (identity) {
      appendEvent(session, {
        kind: "identity",
        message: "Attached ERC-8004 style agent identity metadata.",
        data: identity
      });
    }

    try {
      if (intent === "tip_dancer") {
        const fanPlan = fanAgentForTip(context);
        appendEvent(session, { kind: "fan_agent", message: "Prepared tip plan.", data: fanPlan });
      }

      if (intent === "battle_entry") {
        const dancerPlan = dancerAgentForBattle(context);
        appendEvent(session, { kind: "dancer_agent", message: "Prepared battle entry details.", data: dancerPlan });
      }

      const itemId = resolveItemId(intent, context);
      const quantity = Math.max(1, Number(context?.quantity || 1));
      const checkoutResult = paymentsAgentCheckout(itemId, quantity, {
        intent,
        session_hint: session.id
      });
      appendEvent(session, {
        kind: "payments_agent",
        message: "UCP checkout created.",
        data: {
          checkout_id: checkoutResult?.checkout?.checkout?.id || null,
          total_minor: checkoutResult?.checkout?.checkout?.total_minor || null,
          settlement: checkoutResult?.settlement || null
        }
      });

      const order = getOrderStatus(checkoutResult?.checkout?.checkout?.id || helpers.makeId("ucp-order"));
      appendEvent(session, {
        kind: "payments_agent",
        message: "UCP order status fetched.",
        data: {
          order_id: order?.order?.id || null,
          status: order?.order?.status || null
        }
      });

      session.status = "completed";
      session.updated_at = helpers.nowIso();
      session.summary = buildSummary(session);
      return session;
    } catch (error) {
      session.status = "failed";
      session.updated_at = helpers.nowIso();
      appendEvent(session, { kind: "error", message: error.message });
      session.summary = buildSummary(session);
      return session;
    }
  }

  function listCapabilities() {
    return {
      version: "1.0.0",
      model: "openclaw-style-inrepo",
      optional_gateway_adapter: true,
      identity_enabled: Boolean(getAgentIdentity && getAgentIdentity()?.agent_registry),
      intents: [
        { id: "tip_dancer", description: "Fan to agent tip flow over UCP checkout" },
        { id: "unlock_clip", description: "Agent-driven tutorial unlock checkout" },
        { id: "battle_entry", description: "Multi-agent coordination before checkout" }
      ],
      sub_agents: ["fan_agent", "dancer_agent", "payments_agent"],
      ucp_core_dependency: true
    };
  }

  function getSession(sessionId) {
    return sessions.get(sessionId) || null;
  }

  return {
    runSession,
    getSession,
    listCapabilities,
    tutorialClipsCount: tutorialClips.length
  };
}

module.exports = {
  makeAgentOrchestrator
};
