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

function logKeeperhubDebug(hypothesisId, message, data) {
  fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
    body: JSON.stringify({
      sessionId: "995d4d",
      runId: "post-fix",
      hypothesisId,
      location: "src/keeperhub/client.js",
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
}

/**
 * KeeperHub docs use host `app.keeperhub.com` with API root `/api`.
 * If KEEPERHUB_API_BASE is set to `https://app.keeperhub.com` (no `/api`),
 * requests hit `/chains` instead of `/api/chains` and return HTML 404.
 */
function getBaseUrl(mode = "auto") {
  const normalizedMode = String(mode || "auto").toLowerCase();
  const sharedBase = (process.env.KEEPERHUB_API_BASE || "").trim();
  const localBase = (process.env.KEEPERHUB_API_BASE_LOCAL || "").trim();
  const onlineBase = (process.env.KEEPERHUB_API_BASE_ONLINE || "").trim();
  const sharedLooksLocal = /localhost|127\.0\.0\.1/i.test(sharedBase);
  // If shared base omitted but KEEPERHUB_API_BASE_LOCAL is local, REST should hit localhost
  // (fixes declare-winner /chains going to prod and missing Arc despite local KeeperHub).
  const inferredSharedWhenUnset = sharedBase.trim() ? sharedBase : localBase || "";
  let base =
    normalizedMode === "local"
      ? localBase || sharedBase || DEFAULT_BASE
      : normalizedMode === "online"
        ? onlineBase || (sharedLooksLocal ? DEFAULT_BASE : sharedBase) || DEFAULT_BASE
        : inferredSharedWhenUnset.trim() ? inferredSharedWhenUnset.replace(/\/$/, "") : DEFAULT_BASE;
  base = base.replace(/\/$/, "");
  if (/^https?:\/\/app\.keeperhub\.com$/i.test(base)) {
    return DEFAULT_BASE;
  }
  return base;
}

function resolveApiKeySource(baseUrl = getBaseUrl()) {
  const normalizedBase = String(baseUrl || "").toLowerCase();
  if (normalizedBase.includes("localhost") || normalizedBase.includes("127.0.0.1")) {
    return "local";
  }
  return "online";
}

function getApiKey(mode = "auto") {
  const legacy = (process.env.KEEPERHUB_API_KEY || "").trim();
  const local = (process.env.KEEPERHUB_API_KEY_LOCAL || "").trim();
  const online = (process.env.KEEPERHUB_API_KEY_ONLINE || "").trim();
  const source =
    mode === "local" || mode === "online"
      ? mode
      : resolveApiKeySource(getBaseUrl(mode));
  if (source === "local") {
    return local || legacy;
  }
  return online || legacy;
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
async function keeperhubFetch(path, { method = "GET", body, executeRoute = false, mode = "auto" } = {}) {
  const resolvedBase = getBaseUrl(mode);
  const key = getApiKey(mode);
  logKeeperhubDebug("KH1", "keeperhub fetch called", {
    path,
    method,
    executeRoute,
    apiBase: resolvedBase,
    keySource: mode === "auto" ? resolveApiKeySource(resolvedBase) : mode,
    keyPresent: Boolean(key),
    keyType: key.startsWith("kh_") ? "kh" : key.startsWith("wfb_") ? "wfb" : key ? "other" : "none"
  });
  if (!key) {
    const err = new Error("KEEPERHUB_API_KEY is not set");
    err.code = "keeperhub_not_configured";
    throw err;
  }
  assertOrgApiKeyForRest();
  const url = `${resolvedBase}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`
  };
  if (executeRoute) {
    headers["X-API-Key"] = key;
  }
  const defaultTimeoutMs = executeRoute ? 30000 : 10000;
  const timeoutMs = Number(process.env.KEEPERHUB_REQUEST_TIMEOUT_MS || defaultTimeoutMs);
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
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_e) {
    parsed = { raw: text };
  }
  if (!response.ok) {
    logKeeperhubDebug("KH2", "keeperhub fetch non-ok response", {
      path,
      method,
      executeRoute,
      status: response.status,
      bodyPreview: String(text || "").slice(0, 300)
    });
    if (text.trimStart().startsWith("<!") || text.includes("<title>Error</title>")) {
      const isLocalExecute =
        /\b(localhost|127\.0\.0\.1)\b/i.test(url) && /\/execute\//i.test(path);
      const err = new Error(
        `KeeperHub returned HTML (${response.status}) for ${method} ${url}. ` +
          (isLocalExecute
            ? `Local Next dev (Turbopack) sometimes drops App Router handlers under /api/execute/*. If GET ${url.split("/execute/")[0]}/chains returns JSON but this URL is HTML 404, stop the running KeeperHub dev server and retry with webpack: \`PORT=<port> pnpm dev:webpack\` (not \`pnpm dev -- -p\`, which Next treats as a directory), or smoke test production (\`pnpm build && pnpm start\`). `
            : "") +
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

async function listChains({ includeDisabled = false, mode = "auto" } = {}) {
  const q = includeDisabled ? "?includeDisabled=true" : "";
  const out = await keeperhubFetch(`/chains${q}`, { method: "GET", executeRoute: false, mode });
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
  if (Number(chainRow.chainId) === 5042002) {
    return "arc-testnet";
  }
  const direct =
    chainRow.slug ||
    chainRow.networkSlug ||
    chainRow.network ||
    chainRow.shortName;
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
async function executeTransferPayout({ recipientAddress, amountMinor, network, includeTokenConfig = true, mode = "auto" }) {
  const amount = minorToTransferAmountString(amountMinor);
  const executeNetwork = resolveKeeperhubExecuteNetwork(network);
  const networkKey = String(network || "").toLowerCase();
  const mappedNetworkTokenAddress = NETWORK_USDC_ADDRESSES[networkKey] || "";
  const tokenAddress = mappedNetworkTokenAddress || resolveTokenAddress();
  const expectedTokenAddress = NETWORK_USDC_ADDRESSES[String(network || "").toLowerCase()] || null;
  const tokenAddressNormalized = String(tokenAddress || "").toLowerCase();
  const expectedTokenAddressNormalized = String(expectedTokenAddress || "").toLowerCase();
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
    executeRoute: true,
    mode
  });
}

async function getExecutionStatus(executionId, { mode = "auto" } = {}) {
  const id = encodeURIComponent(String(executionId || ""));
  return keeperhubFetch(`/execute/${id}/status`, { method: "GET", executeRoute: true, mode });
}

/**
 * Prefer arc-testnet fallback when KeeperHub clearly targets localhost, even if
 * KEEPERHUB_API_BASE is unset (getBaseUrl("auto") would otherwise default to prod).
 */
function shouldUseArcTestnetSlugFallback(baseForSummary) {
  const localEnv = String(process.env.KEEPERHUB_API_BASE_LOCAL || "").trim();
  return (
    /localhost|127\.0\.0\.1/i.test(String(baseForSummary || "")) ||
    /localhost|127\.0\.0\.1/i.test(localEnv)
  );
}

function resolveLocalArcFallbackExecuteNetworkSlug() {
  return String(process.env.KEEPERHUB_EXECUTE_NETWORK || "").trim() || "arc-testnet";
}

async function getStatusSummary(arcChainId, { mode = "auto" } = {}) {
  const resolvedMode = String(mode || "auto").toLowerCase();
  const baseForSummary = getBaseUrl(resolvedMode);
  const configured = isConfigured();
  if (!configured) {
    return {
      configured: false,
      api_base: baseForSummary,
      arc_chain_id: Number(arcChainId),
      arc_supported: false,
      execute_network: null,
      chain: null,
      note: "Set KEEPERHUB_API_KEY to enable KeeperHub execution."
    };
  }
  try {
    const chains = await listChains({ includeDisabled: true, mode: resolvedMode });
    const chain = pickArcChain(chains, arcChainId);
    const executeNetworkFromSlug = resolveExecuteNetworkSlug(chain);
    /**
     * Self-hosted KeeperHub often omits Arc from GET /chains even though direct execution
     * accepts a known slug. When API base looks local OR KEEPERHUB_API_BASE_LOCAL is local,
     * fall back so hackathon payouts still run even if KEEPERHUB_API_BASE was left unset.
     * Hosted cloud: Still require Arc in chains or KEEPERHUB_EXECUTE_NETWORK explicitly.
     */
    const localhostBase = shouldUseArcTestnetSlugFallback(baseForSummary);
    let executeNetwork = executeNetworkFromSlug;
    if (!executeNetwork && localhostBase) {
      executeNetwork = resolveLocalArcFallbackExecuteNetworkSlug();
    }

    // #region agent log
    logKeeperhubDebug("KH-H1", "getStatusSummary execute slug resolution", {
      khMode: resolvedMode,
      chainCount: Array.isArray(chains) ? chains.length : null,
      arcChainIdRequested: Number(arcChainId),
      arcRowMatched: Boolean(chain),
      slugFromChainsOrOverride: executeNetworkFromSlug,
      localhostBase,
      localSlugFallbackApplied: Boolean(!executeNetworkFromSlug && executeNetwork),
      resolvedExecuteNetwork: executeNetwork || null,
      keeperhub_api_base_local_set: Boolean(String(process.env.KEEPERHUB_API_BASE_LOCAL || "").trim()),
      hypothesisIdTags: ["H-Arc-not-in-list", "H-env-override"]
    });
    // #endregion

    return {
      configured: true,
      api_base: baseForSummary,
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
      token_address_configured: Boolean(resolveTokenAddress()),
      keeperhub_rest_mode: resolvedMode
    };
  } catch (error) {
    const localhostBase = shouldUseArcTestnetSlugFallback(baseForSummary);
    const executeNetworkFallback = localhostBase ? resolveLocalArcFallbackExecuteNetworkSlug() : null;
    // #region agent log
    logKeeperhubDebug("KH-H1-catch", "getStatusSummary listChains failed", {
      khMode: resolvedMode,
      errorMessage: String(error.message || ""),
      localhostBase,
      resolvedExecuteNetwork: executeNetworkFallback,
      hypothesisIdTags: ["H-listChains-throw"]
    });
    // #endregion
    return {
      configured: true,
      api_base: baseForSummary,
      arc_chain_id: Number(arcChainId),
      arc_supported: false,
      execute_network: executeNetworkFallback,
      chain: null,
      error: error.message,
      keeperhub_rest_mode: resolvedMode
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
