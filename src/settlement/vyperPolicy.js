"use strict";

function createVyperSettlementPolicy() {
  const maxTicketMinor = Number(process.env.VYPER_POLICY_MAX_TICKET_MINOR || 5000);
  const dailyCapMinor = Number(process.env.VYPER_POLICY_DAILY_CAP_MINOR || 25000);
  const registryAddress = process.env.ERC8004_IDENTITY_REGISTRY || "";
  const settlementContractAddress = process.env.VYPER_SETTLEMENT_CONTRACT || "";

  // In-memory demo ledger; contract tests enforce equivalent policy logic.
  const spentByAgent = new Map();

  function evaluate({ agentId, amountMinor, intent }) {
    const normalizedAgentId = String(agentId || "payments-agent");
    const safeAmountMinor = Number(amountMinor || 0);
    const spentToday = spentByAgent.get(normalizedAgentId) || 0;

    const reasons = [];
    if (!Number.isInteger(safeAmountMinor) || safeAmountMinor < 1) {
      reasons.push("invalid_amount");
    }
    if (safeAmountMinor > maxTicketMinor) {
      reasons.push("ticket_limit_exceeded");
    }
    if (spentToday + safeAmountMinor > dailyCapMinor) {
      reasons.push("daily_cap_exceeded");
    }

    const approved = reasons.length === 0;
    if (approved) {
      spentByAgent.set(normalizedAgentId, spentToday + safeAmountMinor);
    }

    return {
      approved,
      reasons,
      policy: {
        type: "vyper_policy_simulation",
        max_ticket_minor: maxTicketMinor,
        daily_cap_minor: dailyCapMinor
      },
      proof: {
        settlement_contract: settlementContractAddress || null,
        identity_registry: registryAddress || null,
        intent: intent || "unknown",
        spent_before_minor: spentToday,
        spent_after_minor: approved ? spentToday + safeAmountMinor : spentToday
      }
    };
  }

  return {
    evaluate
  };
}

module.exports = {
  createVyperSettlementPolicy
};
