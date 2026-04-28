"use strict";

const DEFAULT_BASE = "https://app.keeperhub.com/api";
const ONLINE_EXECUTE_NETWORKS = {
  "ethereum-sepolia": "11155111",
  "base-sepolia": "84532",
  "polygon-amoy": "80002",
  "arbitrum-sepolia": "421614",
  "avalanche-fuji": "43113"
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
  }
  if (path === "/execute/transfer") {
  }
  const defaultTimeoutMs = executeRoute ? 30000 : 10000;
  const timeoutMs = Number(process.env.KEEPERHUB_REQUEST_TIMEOUT_MS || defaultTimeoutMs);
  const startedAt = Date.now();
  if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
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
    }
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
  }
  if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
  }
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_e) {
    parsed = { raw: text };
  }
  if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {
    const executionId = parsed?.executionId || parsed?.data?.executionId || parsed?.id || null;
    const status = parsed?.status || parsed?.data?.status || null;
    const errorText = parsed?.error?.message || parsed?.error || parsed?.message || null;
    // #region agent log
    fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
      body: JSON.stringify({
        sessionId: "995d4d",
        runId: "post-fix",
        hypothesisId: "H-G",
        location: "keeperhub/client.js:keeperhubFetch:execute_response",
        message: "keeperhub execute endpoint response",
        data: { path, httpStatus: response.status, ok: response.ok, executionId, status, errorText },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  }
  if (!response.ok) {
    if (path === "/execute/transfer" || /^\/execute\/[^/]+\/status$/.test(path)) {

    }
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

function resolveKeeperhubExecuteNetwork(network) {
  const raw = String(network || "").trim();
  const key = raw.toLowerCase();
  return ONLINE_EXECUTE_NETWORKS[key] || raw;
}

/**
 * Human-readable amount for /execute/transfer (same minor→USD mapping as the rest of the app).
 */
function minorToTransferAmountString(amountMinor) {
  return (Number(amountMinor) / 100).toFixed(2);
}

function resolveTokenAddress() {
  const resolved = (process.env.KEEPERHUB_TOKEN_ADDRESS || process.env.CIRCLE_TOKEN_ADDRESS || "").trim();
  return resolved;
}

/**
 * Transfer ERC-20 (e.g. USDC on Arc) or native if no token address.
 */
async function executeTransferPayout({ recipientAddress, amountMinor, network, includeTokenConfig = true }) {
  const amount = minorToTransferAmountString(amountMinor);
  const executeNetwork = resolveKeeperhubExecuteNetwork(network);
  const networkKey = String(network || "").toLowerCase();
  const mappedNetworkTokenAddress = NETWORK_USDC_ADDRESSES[networkKey] || "";
  const tokenAddress = mappedNetworkTokenAddress || resolveTokenAddress();
  const expectedTokenAddress = NETWORK_USDC_ADDRESSES[String(network || "").toLowerCase()] || null;
  const tokenAddressNormalized = String(tokenAddress || "").toLowerCase();
  const expectedTokenAddressNormalized = String(expectedTokenAddress || "").toLowerCase();
  // #region agent log
  fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
    body: JSON.stringify({
      sessionId: "995d4d",
      runId: "post-fix",
      hypothesisId: "H-F",
      location: "keeperhub/client.js:executeTransferPayout:network_map",
      message: "mapped keeperhub execute network",
      data: { inputNetwork: network, executeNetwork },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
  const payload = {
    network: executeNetwork,
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
