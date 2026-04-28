"use strict";

const CIRCLE_API_BASE = (process.env.CIRCLE_API_BASE || "https://api.circle.com").replace(/\/$/, "");
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || "";
const CIRCLE_CCTP_TRANSFER_PATH = process.env.CIRCLE_CCTP_TRANSFER_PATH || "/v1/cctp/transfers";
const CIRCLE_CCTP_STATUS_PATH = process.env.CIRCLE_CCTP_STATUS_PATH || "/v1/cctp/transfers";
const CIRCLE_CCTP_TIMEOUT_MS = Number(process.env.CIRCLE_CCTP_TIMEOUT_MS || 120000);
const CIRCLE_CCTP_POLL_MS = Number(process.env.CIRCLE_CCTP_POLL_MS || 5000);

const NETWORKS = {
  "ethereum-sepolia": { keeperhubNetwork: "ethereum-sepolia", circleChain: "ETH-SEPOLIA" },
  "base-sepolia": { keeperhubNetwork: "base-sepolia", circleChain: "BASE-SEPOLIA" },
  "polygon-amoy": { keeperhubNetwork: "polygon-amoy", circleChain: "MATIC-AMOY" },
  "arbitrum-sepolia": { keeperhubNetwork: "arbitrum-sepolia", circleChain: "ARB-SEPOLIA" },
  "avalanche-fuji": { keeperhubNetwork: "avalanche-fuji", circleChain: "AVAX-FUJI" }
};

function listOnlineNetworks() {
  return Object.keys(NETWORKS).map((id) => ({ id, ...NETWORKS[id] }));
}

function resolveOnlineNetwork(id) {
  return NETWORKS[String(id || "").trim().toLowerCase()] || null;
}

function ensureCircleConfiguredForCctp() {
  if (!CIRCLE_API_KEY) {
    const error = new Error("Online mode requires CIRCLE_API_KEY for CCTP bridge.");
    error.code = "cctp_not_configured";
    throw error;
  }
}

async function circleRequest(pathname, payload) {
  const response = await fetch(`${CIRCLE_API_BASE}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_err) {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = body?.message || body?.error || `Circle CCTP HTTP ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function circleGet(pathname) {
  const response = await fetch(`${CIRCLE_API_BASE}${pathname}`, {
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
    const detail = body?.message || body?.error || `Circle CCTP HTTP ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function waitForCctpCompletion(transferId) {
  const started = Date.now();
  while (Date.now() - started < CIRCLE_CCTP_TIMEOUT_MS) {
    const statusBody = await circleGet(`${CIRCLE_CCTP_STATUS_PATH}/${encodeURIComponent(transferId)}`);
    const state =
      statusBody?.state ||
      statusBody?.status ||
      statusBody?.data?.state ||
      statusBody?.data?.status ||
      "unknown";
    if (["complete", "completed", "success", "succeeded", "minted"].includes(String(state).toLowerCase())) {
      return statusBody;
    }
    if (["failed", "error", "rejected"].includes(String(state).toLowerCase())) {
      throw new Error(`CCTP bridge failed with state=${state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, CIRCLE_CCTP_POLL_MS));
  }
  throw new Error(`CCTP bridge timed out after ${CIRCLE_CCTP_TIMEOUT_MS}ms`);
}

async function bridgeUsdcFromArc({ amountMinor, destinationNetwork, recipientAddress, sourceWalletId, memo }) {
  ensureCircleConfiguredForCctp();
  const network = resolveOnlineNetwork(destinationNetwork);
  if (!network) {
    throw new Error(`Unsupported online execution network: ${destinationNetwork}`);
  }
  if (!recipientAddress) {
    throw new Error("Missing recipient address for CCTP bridge");
  }
  if (!sourceWalletId) {
    throw new Error("Missing source Circle wallet id for CCTP bridge");
  }
  const transferRequest = {
    sourceBlockchain: "ARC-TESTNET",
    destinationBlockchain: network.circleChain,
    sourceWalletId,
    destinationAddress: recipientAddress,
    amount: (Number(amountMinor || 0) / 100).toFixed(2),
    tokenSymbol: "USDC",
    metadata: {
      memo: memo || "online-keeperhub-cctp"
    }
  };
  const transfer = await circleRequest(CIRCLE_CCTP_TRANSFER_PATH, transferRequest);
  const transferId =
    transfer?.id || transfer?.data?.id || transfer?.transferId || transfer?.data?.transferId || null;
  if (!transferId) {
    throw new Error("CCTP transfer creation returned no transfer id");
  }
  const completed = await waitForCctpCompletion(transferId);
  return {
    transfer_id: transferId,
    destination_network: destinationNetwork,
    destination_circle_chain: network.circleChain,
    request: transferRequest,
    create_response: transfer,
    completion: completed
  };
}

module.exports = {
  listOnlineNetworks,
  resolveOnlineNetwork,
  bridgeUsdcFromArc
};
