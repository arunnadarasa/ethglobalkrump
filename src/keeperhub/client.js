"use strict";

const DEFAULT_BASE = "https://app.keeperhub.com/api";
const ONLINE_EXECUTE_NETWORKS = {
  "ethereum-sepolia": "ethereum-sepolia",
  "base-sepolia": "base-sepolia",
  "polygon-amoy": "polygon-amoy",
  "arbitrum-sepolia": "arbitrum-sepolia",
  "avalanche-fuji": "avalanche-fuji"
};
const NETWORK_USDC_ADDRESSES = {
  "base-sepolia": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  "ethereum-sepolia": "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  "polygon-amoy": "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582",
  "arbitrum-sepolia": "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
  "avalanche-fuji": "0x5425890298aed601595a70ab815c96711a31bc65"
};

/**
 * KeeperHub docs use host `app.keeperhub.com` with API root `/api`.
 * If KEEPERHUB_API_BASE is set to `https://app.keeperhub.com` (no `/api`),
 * requests hit `/chains` instead of `/api/chains` and return HTML 404.
 */
function getBaseUrl() {
  let base = (process.env.KEEPERHUB_API_BASE || DEFAULT_BASE).trim().replace(/\/$/, "");
  if (/^https?:\/\/app\.keeperhub\.com$/i.test(base)) {
    return DEFAULT_BASE;
  }
  return base;
}

function getApiKey() {
  const legacy = (process.env.KEEPERHUB_API_KEY || "").trim();
  const local = (process.env.KEEPERHUB_API_KEY_LOCAL || "").trim();
  const online = (process.env.KEEPERHUB_API_KEY_ONLINE || "").trim();
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'kh-key-debug-v1',hypothesisId:'H1',location:'src/keeperhub/client.js:getApiKey',message:'KeeperHub key env presence snapshot',data:{hasLegacy:Boolean(legacy),hasLocal:Boolean(local),hasOnline:Boolean(online)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return legacy;
}

function assertOrgApiKeyForRest() {
  const key = getApiKey();
  if (!key) {
    return;
  }
  if (key.startsWith("wfb_")) {
    const err = new Error(
      "KEEPERHUB_API_KEY is a user webhook key (wfb_). Use an Organization key (kh_) from Settings → API Keys → Organisation for REST, chains, and direct execution."
    );
    err.code = "keeperhub_wrong_key_type";
    throw err;
  }
}

function isConfigured() {
  const configured = Boolean(getApiKey());
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'kh-key-debug-v1',hypothesisId:'H2',location:'src/keeperhub/client.js:isConfigured',message:'KeeperHub configured computed',data:{configured},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return configured;
}

/**
 * KeeperHub REST: most routes use Bearer (see authentication docs).
 * Direct execution docs also mention X-API-Key — we send both when calling /execute/*.
 */
async function keeperhubFetch(path, { method = "GET", body, executeRoute = false } = {}) {
  const key = getApiKey();
  if (!key) {
    const err = new Error("KEEPERHUB_API_KEY is not set");
    err.code = "keeperhub_not_configured";
    throw err;
  }
  assertOrgApiKeyForRest();
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`
  };
  if (executeRoute) {
    headers["X-API-Key"] = key;
  }
  if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'keeperhub-exec-debug-v1',hypothesisId:'H13',location:'src/keeperhub/client.js:keeperhubFetch:entry',message:'KeeperHub execute route request starting',data:{path,url,method,hasBearer:Boolean(headers.Authorization),hasXApiKey:Boolean(headers["X-API-Key"]),bodyKeys:body&&typeof body==='object'?Object.keys(body):[]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }
  if (path === "/execute/transfer") {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-wire-debug',hypothesisId:'W1',location:'src/keeperhub/client.js:keeperhubFetch:pre',message:'Outbound request to KeeperHub execute/transfer',data:{url,method,headerKeys:Object.keys(headers),authFormatOk:String(headers.Authorization||'').startsWith('Bearer kh_'),body:body||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }
  const defaultTimeoutMs = executeRoute ? 30000 : 10000;
  const timeoutMs = Number(process.env.KEEPERHUB_REQUEST_TIMEOUT_MS || defaultTimeoutMs);
  const startedAt = Date.now();
  if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
    // #region agent log
    fetch("http://127.0.0.1:7690/ingest/6763d774-eed0-493a-8b58-d55203d9fdc2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "aded7a"
      },
      body: JSON.stringify({
        sessionId: "aded7a",
        runId: "krump-timeout-debug",
        hypothesisId: "K1",
        location: "src/keeperhub/client.js:keeperhubFetch:start",
        message: "keeperhub_request_started",
        data: { path, method, timeoutMs },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (error) {
    if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
      // #region agent log
      fetch("http://127.0.0.1:7690/ingest/6763d774-eed0-493a-8b58-d55203d9fdc2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "aded7a"
        },
        body: JSON.stringify({
          sessionId: "aded7a",
          runId: "krump-timeout-debug",
          hypothesisId: "K2",
          location: "src/keeperhub/client.js:keeperhubFetch:catch",
          message: "keeperhub_request_exception",
          data: {
            path,
            timeoutMs,
            elapsedMs: Date.now() - startedAt,
            errorName: error?.name || null,
            errorMessage: error?.message || null
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
    }
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-wire-debug',hypothesisId:'W4',location:'src/keeperhub/client.js:keeperhubFetch:fetch-catch',message:'KeeperHub fetch threw before response',data:{path,url,timeoutMs,errorName:error?.name||null,errorMessage:error?.message||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (error?.name === "AbortError") {
      const err = new Error(`KeeperHub request timed out after ${timeoutMs}ms for ${method} ${path}`);
      err.status = 504;
      err.code = "keeperhub_timeout";
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
    // #region agent log
    fetch("http://127.0.0.1:7690/ingest/6763d774-eed0-493a-8b58-d55203d9fdc2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "aded7a"
      },
      body: JSON.stringify({
        sessionId: "aded7a",
        runId: "krump-timeout-debug",
        hypothesisId: "K3",
        location: "src/keeperhub/client.js:keeperhubFetch:response",
        message: "keeperhub_request_completed",
        data: {
          path,
          status: response.status,
          elapsedMs: Date.now() - startedAt
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  }
  if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-wire-debug',hypothesisId:'W2',location:'src/keeperhub/client.js:keeperhubFetch:post',message:'Inbound response from KeeperHub',data:{path,status:response.status,rawBody:text},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_e) {
    parsed = { raw: text };
  }
  if (!response.ok) {
    if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
      // #region agent log
      fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'keeperhub-exec-debug-v1',hypothesisId:'H14',location:'src/keeperhub/client.js:keeperhubFetch:error',message:'KeeperHub execute route failed',data:{path,url,status:response.status,responseKeys:parsed&&typeof parsed==='object'?Object.keys(parsed):[],errorCode:parsed?.code||parsed?.error?.code||null,errorMessage:parsed?.error?.message||parsed?.error||parsed?.message||null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      // #region agent log
      fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'keeperhub-token-select-v1',hypothesisId:'H38',location:'src/keeperhub/client.js:keeperhubFetch:error-details',message:'KeeperHub execute error details for token-selection hypotheses',data:{path,status:response.status,rawError:parsed?.error||null,rawMessage:parsed?.message||null,noTokenSelectedHint:String(parsed?.error||parsed?.message||'').toLowerCase().includes('token')},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-token-debug',hypothesisId:'T3',location:'src/keeperhub/client.js:keeperhubFetch:error',message:'KeeperHub request failed',data:{method,url,status:response.status,executeRoute:Boolean(executeRoute),errorCode:parsed?.code||parsed?.error?.code||null,errorMessage:parsed?.error?.message||parsed?.error||parsed?.message||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (text.trimStart().startsWith("<!") || text.includes("<title>Error</title>")) {
      const err = new Error(
        `KeeperHub returned HTML (${response.status}) for ${method} ${url}. ` +
          `If you set KEEPERHUB_API_BASE, it must include /api (e.g. ${DEFAULT_BASE}).`
      );
      err.status = response.status;
      err.body = { html_preview: text.slice(0, 120) };
      throw err;
    }
    const msg =
      parsed?.error?.message ||
      parsed?.error ||
      parsed?.message ||
      (typeof parsed?.error === "string" ? parsed.error : null) ||
      `KeeperHub HTTP ${response.status}`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = response.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

async function listChains({ includeDisabled = false } = {}) {
  const q = includeDisabled ? "?includeDisabled=true" : "";
  const out = await keeperhubFetch(`/chains${q}`, { method: "GET", executeRoute: false });
  const parsedChains = Array.isArray(out) ? out : Array.isArray(out?.data) ? out.data : [];
  return parsedChains;
}

function pickArcChain(chains, arcChainId) {
  const target = Number(arcChainId);
  const match = chains.find((c) => Number(c.chainId) === target) || null;
  return match;
}

/**
 * Slug passed to POST /execute/transfer `network` field.
 * Override with KEEPERHUB_EXECUTE_NETWORK when KeeperHub uses a non-obvious slug.
 */
function resolveExecuteNetworkSlug(chainRow) {
  const override = (process.env.KEEPERHUB_EXECUTE_NETWORK || "").trim();
  if (override) {
    return ONLINE_EXECUTE_NETWORKS[override.toLowerCase()] || override;
  }
  if (!chainRow) {
    return null;
  }
  const direct =
    chainRow.slug ||
    chainRow.networkSlug ||
    chainRow.network ||
    chainRow.shortName ||
    chainRow.id;
  if (direct && typeof direct === "string" && !direct.startsWith("chain_")) {
    return direct.toLowerCase();
  }
  const name = String(chainRow.name || "arc")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return name || "arc-testnet";
}

function listOnlineExecuteNetworks() {
  return Object.keys(ONLINE_EXECUTE_NETWORKS).map((id) => ({
    id,
    execute_network: ONLINE_EXECUTE_NETWORKS[id]
  }));
}

/**
 * Human-readable amount for /execute/transfer (same minor→USD mapping as the rest of the app).
 */
function minorToTransferAmountString(amountMinor) {
  return (Number(amountMinor) / 100).toFixed(2);
}

function resolveTokenAddress() {
  const resolved = (process.env.KEEPERHUB_TOKEN_ADDRESS || process.env.CIRCLE_TOKEN_ADDRESS || "").trim();
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-token-debug',hypothesisId:'T1',location:'src/keeperhub/client.js:resolveTokenAddress',message:'Resolved token address from env',data:{hasKeeperhubToken:Boolean(process.env.KEEPERHUB_TOKEN_ADDRESS),hasCircleToken:Boolean(process.env.CIRCLE_TOKEN_ADDRESS),resolvedPrefix:resolved?resolved.slice(0,10):null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return resolved;
}

/**
 * Transfer ERC-20 (e.g. USDC on Arc) or native if no token address.
 */
async function executeTransferPayout({ recipientAddress, amountMinor, network, includeTokenConfig = true }) {
  const amount = minorToTransferAmountString(amountMinor);
  const networkKey = String(network || "").toLowerCase();
  const mappedNetworkTokenAddress = NETWORK_USDC_ADDRESSES[networkKey] || "";
  const tokenAddress = mappedNetworkTokenAddress || resolveTokenAddress();
  const expectedTokenAddress = NETWORK_USDC_ADDRESSES[String(network || "").toLowerCase()] || null;
  const tokenAddressNormalized = String(tokenAddress || "").toLowerCase();
  const expectedTokenAddressNormalized = String(expectedTokenAddress || "").toLowerCase();
  const payload = {
    network,
    recipientAddress,
    amount,
    gasLimitMultiplier: process.env.KEEPERHUB_GAS_LIMIT_MULTIPLIER || "1.2"
  };
  if (tokenAddress) {
    payload.tokenAddress = tokenAddress;
    if (includeTokenConfig) {
      const decimals = (process.env.KEEPERHUB_TOKEN_DECIMALS || "6").trim();
      const symbol = (process.env.KEEPERHUB_TOKEN_SYMBOL || "USDC").trim();
      const tokenConfigPayload = { decimals: Number(decimals), symbol };
      payload.tokenConfig = JSON.stringify(tokenConfigPayload);
    }
  }
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-token-debug',hypothesisId:'T2',location:'src/keeperhub/client.js:executeTransferPayout:payload',message:'Prepared execute/transfer payload',data:{network:payload.network,hasTokenAddress:Boolean(payload.tokenAddress),hasTokenConfig:Boolean(payload.tokenConfig),tokenAddressPrefix:payload.tokenAddress?String(payload.tokenAddress).slice(0,10):null,amount:payload.amount,recipientPrefix:String(payload.recipientAddress||'').slice(0,10)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'keeperhub-token-select-v3',hypothesisId:'H37',location:'src/keeperhub/client.js:executeTransferPayout:token-selection',message:'Token selection inputs for keeperhub execute route',data:{network:payload.network,resolvedTokenAddress:payload.tokenAddress||null,expectedUsdcForNetwork:expectedTokenAddress,tokenAddressMatchesExpected:Boolean(tokenAddressNormalized&&expectedTokenAddressNormalized&&tokenAddressNormalized===expectedTokenAddressNormalized),includeTokenConfig:Boolean(includeTokenConfig),tokenConfigType:typeof payload.tokenConfig,tokenConfigPreview:String(payload.tokenConfig||'').slice(0,80)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'keeperhub-token-select-v1',hypothesisId:'H39',location:'src/keeperhub/client.js:executeTransferPayout:token-source',message:'Token address source chosen for keeperhub execute route',data:{network:payload.network,usedMappedNetworkToken:Boolean(mappedNetworkTokenAddress),mappedTokenPrefix:mappedNetworkTokenAddress?String(mappedNetworkTokenAddress).slice(0,10):null,fallbackEnvTokenPrefix:resolveTokenAddress()?String(resolveTokenAddress()).slice(0,10):null,finalTokenPrefix:payload.tokenAddress?String(payload.tokenAddress).slice(0,10):null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-wire-debug',hypothesisId:'W3',location:'src/keeperhub/client.js:executeTransferPayout',message:'Payload shape before keeperhubFetch call',data:{tokenConfigType:typeof payload.tokenConfig,tokenConfigValue:payload.tokenConfig||null,tokenAddress:payload.tokenAddress||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return keeperhubFetch("/execute/transfer", {
    method: "POST",
    body: payload,
    executeRoute: true
  });
}

async function getExecutionStatus(executionId) {
  const id = encodeURIComponent(String(executionId || ""));
  return keeperhubFetch(`/execute/${id}/status`, { method: "GET", executeRoute: true });
}

async function getStatusSummary(arcChainId) {
  const configured = isConfigured();
  if (!configured) {
    return {
      configured: false,
      api_base: getBaseUrl(),
      arc_chain_id: Number(arcChainId),
      arc_supported: false,
      execute_network: null,
      chain: null,
      note: "Set KEEPERHUB_API_KEY to enable KeeperHub execution."
    };
  }
  try {
    const chains = await listChains({ includeDisabled: true });
    const chain = pickArcChain(chains, arcChainId);
    const executeNetwork = resolveExecuteNetworkSlug(chain);
    return {
      configured: true,
      api_base: getBaseUrl(),
      arc_chain_id: Number(arcChainId),
      arc_supported: Boolean(chain),
      execute_network: executeNetwork,
      chain: chain
        ? {
            id: chain.id,
            chainId: chain.chainId,
            name: chain.name,
            symbol: chain.symbol,
            isTestnet: chain.isTestnet,
            isEnabled: chain.isEnabled
          }
        : null,
      token_address_configured: Boolean(resolveTokenAddress())
    };
  } catch (error) {
    return {
      configured: true,
      api_base: getBaseUrl(),
      arc_chain_id: Number(arcChainId),
      arc_supported: false,
      execute_network: null,
      chain: null,
      error: error.message
    };
  }
}

module.exports = {
  isConfigured,
  getBaseUrl,
  listChains,
  pickArcChain,
  resolveExecuteNetworkSlug,
  executeTransferPayout,
  getExecutionStatus,
  getStatusSummary,
  minorToTransferAmountString,
  listOnlineExecuteNetworks
};
