"use strict";

const { BridgeKit, ArcTestnet, EthereumSepolia, BaseSepolia, PolygonAmoy, ArbitrumSepolia, AvalancheFuji } = require(
  "@circle-fin/bridge-kit"
);
const { createCircleWalletsAdapter } = require("@circle-fin/adapter-circle-wallets");

const CIRCLE_API_BASE = (process.env.CIRCLE_API_BASE || "https://api.circle.com").replace(/\/$/, "");
const CIRCLE_API_KEY = (process.env.CIRCLE_API_KEY || "").trim();
const CIRCLE_ENTITY_SECRET = (process.env.CIRCLE_ENTITY_SECRET || "").trim();
const CIRCLE_ENTITY_SECRET_RAW = (process.env.CIRCLE_ENTITY_SECRET_RAW || "").trim();
let adapterInstance = null;
let bridgeKitInstance = null;

const NETWORKS = {
  "ethereum-sepolia": { keeperhubNetwork: "ethereum-sepolia", bridgeChain: EthereumSepolia, bridgeChainId: "Ethereum_Sepolia" },
  "base-sepolia": { keeperhubNetwork: "base-sepolia", bridgeChain: BaseSepolia, bridgeChainId: "Base_Sepolia" },
  "polygon-amoy": { keeperhubNetwork: "polygon-amoy", bridgeChain: PolygonAmoy, bridgeChainId: "Polygon_Amoy" },
  "arbitrum-sepolia": { keeperhubNetwork: "arbitrum-sepolia", bridgeChain: ArbitrumSepolia, bridgeChainId: "Arbitrum_Sepolia" },
  "avalanche-fuji": { keeperhubNetwork: "avalanche-fuji", bridgeChain: AvalancheFuji, bridgeChainId: "Avalanche_Fuji" }
};

function listOnlineNetworks() {
  return Object.keys(NETWORKS).map((id) => ({
    id,
    keeperhubNetwork: NETWORKS[id].keeperhubNetwork,
    bridgeChainId: NETWORKS[id].bridgeChainId
  }));
}

function resolveOnlineNetwork(id) {
  return NETWORKS[String(id || "").trim().toLowerCase()] || null;
}

function resolveEntitySecretForSdk() {
  if (CIRCLE_ENTITY_SECRET_RAW) {
    return CIRCLE_ENTITY_SECRET_RAW;
  }
  if (/^[a-z0-9]{64}$/.test(CIRCLE_ENTITY_SECRET)) {
    return CIRCLE_ENTITY_SECRET;
  }
  const error = new Error(
    "Arc App Kit bridge requires CIRCLE_ENTITY_SECRET_RAW (or CIRCLE_ENTITY_SECRET when it contains the raw 64-char secret)."
  );
  error.code = "arc_bridge_missing_entity_secret";
  error.status = 400;
  throw error;
}

function ensureCircleConfiguredForBridgeKit() {
  if (!CIRCLE_API_KEY) {
    const error = new Error("Online mode requires CIRCLE_API_KEY for Arc App Kit bridge.");
    error.code = "cctp_not_configured";
    throw error;
  }
  resolveEntitySecretForSdk();
}

function getBridgeKitAdapter() {
  if (!adapterInstance) {
    adapterInstance = createCircleWalletsAdapter({
      apiKey: CIRCLE_API_KEY,
      entitySecret: resolveEntitySecretForSdk(),
      baseUrl: CIRCLE_API_BASE
    });
  }
  return adapterInstance;
}

function getBridgeKit() {
  if (!bridgeKitInstance) {
    bridgeKitInstance = new BridgeKit();
  }
  return bridgeKitInstance;
}

async function fetchCircleWalletAddress(walletId) {
  const response = await fetch(`${CIRCLE_API_BASE}/v1/w3s/wallets/${encodeURIComponent(walletId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      "Content-Type": "application/json"
    }
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_err) {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = body?.message || body?.error || `Circle wallets API ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.code = "arc_bridge_wallet_lookup_failed";
    error.status = response.status;
    throw error;
  }
  const resolved =
    body?.data?.wallet?.address ||
    body?.data?.wallets?.[0]?.address ||
    body?.wallet?.address ||
    body?.address ||
    "";
  if (!resolved) {
    const error = new Error(`Circle wallet ${walletId} has no address in API response`);
    error.code = "arc_bridge_wallet_address_missing";
    error.status = 502;
    throw error;
  }
  return resolved;
}

function extractBridgeTransferId(result) {
  const direct =
    result?.transactionHash ||
    result?.txHash ||
    result?.id ||
    result?.traceId ||
    result?.operationId ||
    null;
  if (direct) {
    return String(direct);
  }
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  for (const step of steps) {
    const hash = step?.transactionHash || step?.txHash || step?.values?.txHash || step?.values?.transactionHash;
    if (hash) {
      return String(hash);
    }
  }
  return null;
}

async function bridgeUsdcFromArc({
  amountMinor,
  destinationNetwork,
  recipientAddress,
  sourceWalletId,
  sourceWalletAddress,
  memo
}) {
  ensureCircleConfiguredForBridgeKit();
  const network = resolveOnlineNetwork(destinationNetwork);
  if (!network) {
    throw new Error(`Unsupported online execution network: ${destinationNetwork}`);
  }
  const destination = String(recipientAddress || "").trim();
  if (!destination) {
    throw new Error("Missing recipient address for Arc App Kit bridge");
  }
  let sourceAddress = String(sourceWalletAddress || "").trim();
  if (!sourceAddress) {
    if (!sourceWalletId) {
      const error = new Error(
        "Missing source Circle wallet id/address for Arc App Kit bridge. Set CIRCLE_WALLET_ID_ONLINE or create a Circle wallet first."
      );
      error.code = "arc_bridge_source_wallet_missing";
      throw error;
    }
    sourceAddress = await fetchCircleWalletAddress(sourceWalletId);
  }
  const amount = (Number(amountMinor || 0) / 100).toFixed(2);
  const adapter = getBridgeKitAdapter();
  const bridgeKit = getBridgeKit();
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-arc-bridge-v1',hypothesisId:'H16',location:'src/settlement/cctpBridge.js:bridgeUsdcFromArc:entry',message:'Arc App Kit bridge request starting',data:{destinationNetwork,bridgeChainId:network.bridgeChainId,amount,hasSourceWalletId:Boolean(sourceWalletId),sourceAddressPrefix:sourceAddress.slice(0,10),destinationPrefix:destination.slice(0,10),hasMemo:Boolean(memo)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const bridgeResult = await bridgeKit.bridge({
    from: {
      adapter,
      chain: ArcTestnet,
      address: sourceAddress
    },
    to: {
      adapter,
      chain: network.bridgeChain,
      address: destination
    },
    amount,
    token: "USDC"
  });
  const state = String(bridgeResult?.state || bridgeResult?.status || "success").toLowerCase();
  if (!["success", "succeeded", "complete", "completed"].includes(state)) {
    const error = new Error(`Arc App Kit bridge did not complete successfully (state=${state})`);
    error.code = "arc_bridge_failed";
    error.status = 502;
    error.bridge = bridgeResult;
    throw error;
  }
  const transferId = extractBridgeTransferId(bridgeResult) || `arc-bridge-${Date.now().toString(36)}`;
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-arc-bridge-v1',hypothesisId:'H17',location:'src/settlement/cctpBridge.js:bridgeUsdcFromArc:success',message:'Arc App Kit bridge request completed',data:{destinationNetwork,bridgeState:state,transferId},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return {
    transfer_id: transferId,
    transfer_path_used: "arc-app-kit-bridge",
    destination_network: destinationNetwork,
    destination_circle_chain: network.bridgeChainId,
    request: {
      source_chain: "Arc_Testnet",
      destination_chain: network.bridgeChainId,
      source_address: sourceAddress,
      destination_address: destination,
      amount,
      token: "USDC"
    },
    create_response: bridgeResult,
    completion: bridgeResult
  };
}

module.exports = {
  listOnlineNetworks,
  resolveOnlineNetwork,
  bridgeUsdcFromArc
};
