"use strict";

const cctpBridge = require("./cctpBridge");

function normalizeMode(mode) {
  return String(mode || "local").trim().toLowerCase();
}

function resolveExecutionInput({ executionMode, executionNetwork, defaultNetwork = "base-sepolia" }) {
  const mode = normalizeMode(executionMode);
  if (!["local", "online"].includes(mode)) {
    const error = new Error(`Unsupported execution_mode: ${executionMode}`);
    error.code = "unsupported_execution_mode";
    throw error;
  }
  if (mode === "local") {
    return { mode, network: null };
  }
  const network = String(executionNetwork || defaultNetwork).trim().toLowerCase();
  const resolved = cctpBridge.resolveOnlineNetwork(network);
  if (!resolved) {
    const error = new Error(`Unsupported online execution network: ${executionNetwork}`);
    error.code = "unsupported_online_network";
    throw error;
  }
  return { mode, network };
}

function createExecutionRouter({ keeperhub, defaultNetwork = "base-sepolia" }) {
  async function execute({
    executionMode,
    executionNetwork,
    amountMinor,
    recipientAddress,
    memo,
    sourceWalletId,
    sourceWalletAddress
  }) {
    const selected = resolveExecutionInput({ executionMode, executionNetwork, defaultNetwork });
    if (selected.mode === "local") {
      return {
        mode: "local",
        network: null,
        bridge: null,
        keeperhub: null,
        payment_ref: null
      };
    }
    const bridge = await cctpBridge.bridgeUsdcFromArc({
      amountMinor,
      destinationNetwork: selected.network,
      recipientAddress,
      sourceWalletId,
      sourceWalletAddress,
      memo
    });
    const online = cctpBridge.resolveOnlineNetwork(selected.network);
    const transfer = await keeperhub.executeTransferPayout({
      recipientAddress,
      amountMinor,
      network: online.keeperhubNetwork,
      mode: "online"
    });
    return {
      mode: "online",
      network: selected.network,
      bridge,
      keeperhub: transfer,
      payment_ref:
        transfer?.executionId || transfer?.id || bridge?.transfer_id || `online-${Date.now().toString(36)}`
    };
  }

  return {
    execute,
    resolveExecutionInput,
    listOnlineNetworks: cctpBridge.listOnlineNetworks,
    resolveDestinationSignerFundingHint: cctpBridge.resolveDestinationSignerFundingHint
  };
}

module.exports = {
  createExecutionRouter
};
