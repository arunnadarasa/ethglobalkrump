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
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-wallet-debug-v1',hypothesisId:'H5',location:'src/settlement/executionRouter.js:execute:pre-bridge',message:'Execution router preparing online bridge',data:{mode:selected.mode,network:selected.network,amountMinor,hasRecipient:Boolean(recipientAddress),hasSourceWalletId:Boolean(sourceWalletId),sourceWalletIdPrefix:sourceWalletId?String(sourceWalletId).slice(0,8):null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const bridge = await cctpBridge.bridgeUsdcFromArc({
      amountMinor,
      destinationNetwork: selected.network,
      recipientAddress,
      sourceWalletId,
      sourceWalletAddress,
      memo
    });
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-cctp-debug-v1',hypothesisId:'H11',location:'src/settlement/executionRouter.js:execute:post-bridge',message:'CCTP bridge completed, preparing KeeperHub transfer',data:{network:selected.network,hasBridge:Boolean(bridge),bridgeTransferId:bridge?.transfer_id||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const online = cctpBridge.resolveOnlineNetwork(selected.network);
    const transfer = await keeperhub.executeTransferPayout({
      recipientAddress,
      amountMinor,
      network: online.keeperhubNetwork
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
