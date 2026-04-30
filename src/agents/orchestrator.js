"use strict";

function makeAgentOrchestrator({
  helpers,
  tutorialClips,
  createCheckout,
  getOrderStatus,
  evaluateSettlementPolicy,
  getAgentIdentity,
  authorizeX402Payment
}) {
  const sessions = new Map();
  const defaultHighRiskIntents = ["challenge_payout", "crew_split_settlement"];

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
    const paymentMode = context?.payment_mode || "offchain_demo";
    const agentIdForPolicy = context?.agent_actor_address || "payments-agent";
    const settlement =
      typeof evaluateSettlementPolicy === "function"
        ? evaluateSettlementPolicy({
            agentId: agentIdForPolicy,
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
            type: "card",
            brand: "visa",
            last_digits: "4242"
          }
        ],
        selected_instrument_id: "agent-instrument-1"
      },
      metadata: {
        session_hint: String(context?.session_hint || ""),
        payment_mode: paymentMode
      }
    };
    const checkout = createCheckout(checkoutRequest);
    return {
      checkout,
      settlement,
      payment_mode: paymentMode
    };
  }

  function resolveItemId(intent, context) {
    if (intent === "merch_concierge_checkout") {
      return context?.item_id || "merch-1";
    }
    if (intent === "unlock_clip") {
      return context?.clip_id || "clip-1";
    }
    if (intent === "battle_entry") {
      return context?.clip_id || "clip-2";
    }
    return context?.clip_id || "clip-1";
  }

  function runSession(intent, context) {
    const identity = typeof getAgentIdentity === "function" ? getAgentIdentity(context) : null;
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
        message: "Attached agent identity metadata (ENS + ERC-8004 style when configured).",
        data: identity
      });
    }

    try {
      if (context?.__ensResolutionError) {
        throw new Error(`ENS resolution failed: ${context.__ensResolutionError}`);
      }

      if (Array.isArray(context?.__ensAllowedIntents) && context.__ensAllowedIntents.length > 0) {
        const allowed = context.__ensAllowedIntents;
        if (!allowed.includes(intent)) {
          throw new Error(`ENS gating blocked intent "${intent}". Allowed intents: ${allowed.join(", ")}`);
        }
      }

      const highRiskIntents = Array.isArray(context?.__ensTrust?.high_risk_intents) &&
        context.__ensTrust.high_risk_intents.length > 0
        ? context.__ensTrust.high_risk_intents
        : defaultHighRiskIntents;
      const isHighRiskIntent = highRiskIntents.includes(intent);
      const isAttested = context?.__ensTrust?.attested === true;
      if (isHighRiskIntent && !isAttested) {
        throw new Error(
          `ENS trust gate blocked high-risk intent "${intent}". Set a non-empty ENSIP-25 agent-registration[registry][agentId] text record first.`
        );
      }

      const compatibleIntents = Array.isArray(context?.__ensVersioning?.compatible_intents)
        ? context.__ensVersioning.compatible_intents
        : [];
      if (compatibleIntents.length > 0 && !compatibleIntents.includes(intent)) {
        throw new Error(
          `ENS version gate blocked intent "${intent}". Compatible intents: ${compatibleIntents.join(", ")}`
        );
      }

      const paymentMode = context?.payment_mode || "offchain_demo";
      if (paymentMode !== "offchain_demo" && !context?.payment_ref) {
        throw new Error(`Missing payment_ref for payment_mode=${paymentMode}`);
      }
      appendEvent(session, {
        kind: "payments_agent",
        message: "Payment rail context accepted.",
        data: {
          payment_mode: paymentMode,
          payment_ref: context?.payment_ref || null,
          amount_minor: Number(context?.amount_minor || 0),
          payout_mode: context?.payout_mode || "public",
          payout_receiver: context?.payout_receiver || context?.agent_actor_address || null
        }
      });
      if (paymentMode === "x402") {
        const pilotIntents = Array.isArray(context?.__x402PilotIntents) ? context.__x402PilotIntents : [];
        const pilotRestricted = pilotIntents.length > 0;
        if (pilotRestricted && !pilotIntents.includes(intent)) {
          throw new Error(
            `x402 rail is limited to pilot intents: ${pilotIntents.join(", ")}. Received: ${intent}`
          );
        }
        const x402AmountMinor = Number(context?.amount_minor || 0);
        appendEvent(session, {
          kind: "x402_request_started",
          message: "x402 enrichment/payment trace started.",
          data: {
            intent,
            amount_minor: x402AmountMinor,
            payment_ref: context?.payment_ref || null
          }
        });
        if (!context?.payment_ref && typeof authorizeX402Payment === "function") {
          try {
            const x402Result = authorizeX402Payment({
              intent,
              amountMinor: x402AmountMinor,
              sessionHint: session.id,
              memo: `agent-${intent}`,
              context
            });
            if (x402Result?.payment_ref) {
              context.payment_ref = String(x402Result.payment_ref);
              context.__x402Receipt = x402Result.receipt || null;
            }
          } catch (x402Error) {
            appendEvent(session, {
              kind: "x402_failed",
              message: x402Error.message
            });
            throw x402Error;
          }
        }
        appendEvent(session, {
          kind: "x402_paid",
          message: "x402 payment context validated for session.",
          data: {
            intent,
            payment_ref: context?.payment_ref || null
          }
        });
      }
      appendEvent(session, {
        kind: "ens_policy",
        message: "Resolved ENS trust/privacy/version policy state.",
        data: {
          high_risk_intent: isHighRiskIntent,
          trust_attested: isAttested,
          payout_mode: context?.payout_mode || "public",
          payout_receiver: context?.payout_receiver || null,
          agent_version: context?.__ensVersioning?.agent_version || null,
          capabilities_version: context?.__ensVersioning?.capabilities_version || null
        }
      });

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
        ...context,
        intent,
        session_hint: session.id,
        payment_mode: context?.payment_mode || "offchain_demo"
      });
      appendEvent(session, {
        kind: "payments_agent",
        message: "UCP checkout created.",
        data: {
          checkout_id: checkoutResult?.checkout?.checkout?.id || null,
          total_minor: checkoutResult?.checkout?.checkout?.total_minor || null,
          payment_mode: checkoutResult?.payment_mode || "offchain_demo",
          settlement: checkoutResult?.settlement || null,
          payout_route: context?.payout_mode || "public",
          payout_receiver: context?.payout_receiver || null
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
        { id: "battle_entry", description: "Multi-agent coordination before checkout" },
        { id: "judge_feedback_request", description: "Agent-mediated judge feedback purchase flow" },
        { id: "crew_split_settlement", description: "Agent-assisted crew split settlement initiation" },
        { id: "practice_room_reserve", description: "Agent-coordinated practice room reservation checkout" },
        { id: "sample_pack_purchase", description: "Agent-assisted sample pack licensing checkout" },
        { id: "challenge_payout", description: "Agent-guided challenge bounty payout flow" },
        { id: "merch_concierge_checkout", description: "Agent-assisted merch checkout flow over UCP" }
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
