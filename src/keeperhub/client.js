"use strict";

const DEFAULT_BASE = "https://app.keeperhub.com/api";

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
  return (process.env.KEEPERHUB_API_KEY || "").trim();
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
  return Boolean(getApiKey());
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
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_e) {
    parsed = { raw: text };
  }
  if (!response.ok) {
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
  return Array.isArray(out?.data) ? out.data : [];
}

function pickArcChain(chains, arcChainId) {
  const target = Number(arcChainId);
  return chains.find((c) => Number(c.chainId) === target) || null;
}

/**
 * Slug passed to POST /execute/transfer `network` field.
 * Override with KEEPERHUB_EXECUTE_NETWORK when KeeperHub uses a non-obvious slug.
 */
function resolveExecuteNetworkSlug(chainRow) {
  const override = (process.env.KEEPERHUB_EXECUTE_NETWORK || "").trim();
  if (override) {
    return override;
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

/**
 * Human-readable amount for /execute/transfer (same minor→USD mapping as the rest of the app).
 */
function minorToTransferAmountString(amountMinor) {
  return (Number(amountMinor) / 100).toFixed(2);
}

function resolveTokenAddress() {
  return (process.env.KEEPERHUB_TOKEN_ADDRESS || process.env.CIRCLE_TOKEN_ADDRESS || "").trim();
}

/**
 * Transfer ERC-20 (e.g. USDC on Arc) or native if no token address.
 */
async function executeTransferPayout({ recipientAddress, amountMinor, network }) {
  const amount = minorToTransferAmountString(amountMinor);
  const tokenAddress = resolveTokenAddress();
  const payload = {
    network,
    recipientAddress,
    amount,
    gasLimitMultiplier: process.env.KEEPERHUB_GAS_LIMIT_MULTIPLIER || "1.2"
  };
  if (tokenAddress) {
    payload.tokenAddress = tokenAddress;
    const decimals = (process.env.KEEPERHUB_TOKEN_DECIMALS || "6").trim();
    const symbol = (process.env.KEEPERHUB_TOKEN_SYMBOL || "USDC").trim();
    payload.tokenConfig = JSON.stringify({ decimals: Number(decimals), symbol });
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
  minorToTransferAmountString
};
