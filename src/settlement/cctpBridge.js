"use strict";

const CIRCLE_API_BASE = (process.env.CIRCLE_API_BASE || "https://api.circle.com").replace(/\/$/, "");
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || "";
const CIRCLE_CCTP_TRANSFER_PATH = process.env.CIRCLE_CCTP_TRANSFER_PATH || "/v1/cctp/transfers";
const CIRCLE_CCTP_STATUS_PATH = process.env.CIRCLE_CCTP_STATUS_PATH || "/v1/cctp/transfers";
const CIRCLE_CCTP_TIMEOUT_MS = Number(process.env.CIRCLE_CCTP_TIMEOUT_MS || 120000);
const CIRCLE_CCTP_POLL_MS = Number(process.env.CIRCLE_CCTP_POLL_MS || 5000);
let cctpProbePromise = null;

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
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-cctp-debug-v1',hypothesisId:'H8',location:'src/settlement/cctpBridge.js:circleRequest:entry',message:'Calling Circle CCTP POST endpoint',data:{pathname,hasApiKey:Boolean(CIRCLE_API_KEY),payloadKeys:Object.keys(payload||{}),destinationBlockchain:payload?.destinationBlockchain||null,sourceBlockchain:payload?.sourceBlockchain||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-cctp-debug-v1',hypothesisId:'H8',location:'src/settlement/cctpBridge.js:circleRequest:error',message:'Circle CCTP POST failed',data:{pathname,status:response.status,bodyKeys:body&&typeof body==='object'?Object.keys(body):[],errorMessage:body?.message||body?.error||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const detail = body?.message || body?.error || `Circle CCTP HTTP ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function circleGet(pathname) {
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-cctp-debug-v1',hypothesisId:'H9',location:'src/settlement/cctpBridge.js:circleGet:entry',message:'Calling Circle CCTP GET endpoint',data:{pathname,hasApiKey:Boolean(CIRCLE_API_KEY)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-cctp-debug-v1',hypothesisId:'H9',location:'src/settlement/cctpBridge.js:circleGet:error',message:'Circle CCTP GET failed',data:{pathname,status:response.status,bodyKeys:body&&typeof body==='object'?Object.keys(body):[],errorMessage:body?.message||body?.error||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const detail = body?.message || body?.error || `Circle CCTP HTTP ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function probeCctpApiAvailability() {
  if (cctpProbePromise) {
    return cctpProbePromise;
  }
  cctpProbePromise = (async () => {
    const probePaths = ["/v1/publicKeys", "/v2/publicKeys"];
    const probeResults = [];
    for (const path of probePaths) {
      let status = null;
      let bodyKeys = [];
      try {
        const response = await fetch(`${CIRCLE_API_BASE}${path}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${CIRCLE_API_KEY}`,
            "Content-Type": "application/json"
          }
        });
        status = response.status;
        const text = await response.text();
        let body = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch (_err) {
          body = { raw: text };
        }
        bodyKeys = body && typeof body === "object" ? Object.keys(body) : [];
      } catch (_error) {
        status = -1;
      }
      probeResults.push({ path, status, bodyKeys });
    }
    const allNotFound =
      probeResults.length > 0 &&
      probeResults.every((result) => Number(result?.status) === 404);
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-cctp-debug-v3',hypothesisId:'H15',location:'src/settlement/cctpBridge.js:probeCctpApiAvailability',message:'CCTP API capability probe results',data:{circleApiBase:CIRCLE_API_BASE,probeResults},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (allNotFound) {
      const error = new Error(
        `CCTP API unavailable at ${CIRCLE_API_BASE}. Set a valid CCTP API host/path for your Circle setup.`
      );
      error.code = "cctp_api_unavailable";
      error.status = 502;
      throw error;
    }
    return probeResults;
  })();
  return cctpProbePromise;
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
  await probeCctpApiAvailability();
  const network = resolveOnlineNetwork(destinationNetwork);
  if (!network) {
    throw new Error(`Unsupported online execution network: ${destinationNetwork}`);
  }
  if (!recipientAddress) {
    throw new Error("Missing recipient address for CCTP bridge");
  }
  if (!sourceWalletId) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-wallet-debug-v1',hypothesisId:'H6',location:'src/settlement/cctpBridge.js:bridgeUsdcFromArc:missing-source-wallet',message:'CCTP bridge missing source wallet id',data:{destinationNetwork,hasRecipient:Boolean(recipientAddress),amountMinor},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error(
      "Missing source Circle wallet id for CCTP bridge. Set CIRCLE_WALLET_ID_ONLINE or CIRCLE_WALLET_ID, or create a Circle wallet in UI first."
    );
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
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-cctp-debug-v1',hypothesisId:'H10',location:'src/settlement/cctpBridge.js:bridgeUsdcFromArc:no-transfer-id',message:'CCTP create response missing transfer id',data:{responseKeys:transfer&&typeof transfer==='object'?Object.keys(transfer):[]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error("CCTP transfer creation returned no transfer id");
  }
  const completed = await waitForCctpCompletion(transferId);
  return {
    transfer_id: transferId,
    transfer_path_used: CIRCLE_CCTP_TRANSFER_PATH,
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
