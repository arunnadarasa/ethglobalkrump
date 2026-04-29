"use strict";

const {
  BridgeKit,
  ArcTestnet,
  EthereumSepolia,
  BaseSepolia,
  PolygonAmoy,
  ArbitrumSepolia,
  AvalancheFuji,
  TransferSpeed
} = require("@circle-fin/bridge-kit");
const { createCircleWalletsAdapter } = require("@circle-fin/adapter-circle-wallets");

const CIRCLE_API_BASE = (process.env.CIRCLE_API_BASE || "https://api.circle.com").replace(/\/$/, "");
const CIRCLE_API_KEY = (process.env.CIRCLE_API_KEY || "").trim();
const CIRCLE_ENTITY_SECRET = (process.env.CIRCLE_ENTITY_SECRET || "").trim();
const CIRCLE_ENTITY_SECRET_RAW = (process.env.CIRCLE_ENTITY_SECRET_RAW || "").trim();
const ARC_RPC_URL = (process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network").trim();
/** Optional; merged into Amoy `rpcEndpoints` for probes + Bridge Kit mint. */
const POLYGON_AMOY_RPC_URL = (process.env.POLYGON_AMOY_RPC_URL || "").trim();
/** When true (default), stable public Amoy RPCs are tried before `POLYGON_AMOY_RPC_URL` (helps Alchemy/server-side failures). */
const POLYGON_AMOY_RPC_PUBLIC_FIRST =
  String(process.env.POLYGON_AMOY_RPC_PUBLIC_FIRST || "true")
    .trim()
    .toLowerCase() !== "false";
const ALLOW_LOW_DESTINATION_GAS = String(process.env.ALLOW_LOW_DESTINATION_GAS || "")
  .trim()
  .toLowerCase() === "true";
/** FAST | SLOW — unset lets Bridge Kit default to FAST; set SLOW for standard CCTP timing. */
const ARC_BRIDGE_TRANSFER_SPEED = String(process.env.ARC_BRIDGE_TRANSFER_SPEED || "").trim().toUpperCase();
let adapterInstance = null;
let bridgeKitInstance = null;

const NETWORKS = {
  "ethereum-sepolia": {
    keeperhubNetwork: "ethereum-sepolia",
    bridgeChain: EthereumSepolia,
    bridgeChainId: "Ethereum_Sepolia",
    circleBlockchain: "ETH-SEPOLIA",
    nativeSymbol: "ETH"
  },
  "base-sepolia": {
    keeperhubNetwork: "base-sepolia",
    bridgeChain: BaseSepolia,
    bridgeChainId: "Base_Sepolia",
    circleBlockchain: "BASE-SEPOLIA",
    nativeSymbol: "ETH"
  },
  "polygon-amoy": {
    keeperhubNetwork: "polygon-amoy",
    bridgeChain: PolygonAmoy,
    bridgeChainId: "Polygon_Amoy",
    circleBlockchain: "MATIC-AMOY",
    nativeSymbol: "POL"
  },
  "arbitrum-sepolia": {
    keeperhubNetwork: "arbitrum-sepolia",
    bridgeChain: ArbitrumSepolia,
    bridgeChainId: "Arbitrum_Sepolia",
    circleBlockchain: "ARB-SEPOLIA",
    nativeSymbol: "ETH"
  },
  "avalanche-fuji": {
    keeperhubNetwork: "avalanche-fuji",
    bridgeChain: AvalancheFuji,
    bridgeChainId: "Avalanche_Fuji",
    circleBlockchain: "AVAX-FUJI",
    nativeSymbol: "AVAX"
  }
};

const DESTINATION_GAS_FAUCETS = {
  "base-sepolia": "https://www.alchemy.com/faucets/base-sepolia",
  "ethereum-sepolia": "https://www.alchemy.com/faucets/ethereum-sepolia",
  "polygon-amoy": "https://faucet.polygon.technology/",
  "arbitrum-sepolia": "https://www.alchemy.com/faucets/arbitrum-sepolia",
  "avalanche-fuji": "https://core.app/tools/testnet-faucet/?subnet=c&token=c"
};

const DESTINATION_MIN_NATIVE_GAS = {
  "base-sepolia": 0.001,
  "ethereum-sepolia": 0.001,
  /** Headroom for Circle wallet pending tx fees on Amoy (observed ~0.176 POL required vs balance). */
  "polygon-amoy": 0.25,
  "arbitrum-sepolia": 0.001,
  "avalanche-fuji": 0.01
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

async function fetchAnyCircleWalletAddressOnBlockchain(blockchain) {
  const response = await fetch(
    `${CIRCLE_API_BASE}/v1/w3s/wallets?blockchain=${encodeURIComponent(blockchain)}&pageSize=50`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_err) {
    body = { raw: text };
  }
  if (!response.ok) {
    return { address: "", body, status: response.status };
  }
  const wallets = body?.data?.wallets || body?.wallets || [];
  const wallet = Array.isArray(wallets) ? wallets.find((w) => Boolean(w?.address)) : null;
  const walletPreview = Array.isArray(wallets)
    ? wallets.slice(0, 3).map((w) => ({
        idPrefix: String(w?.id || "").slice(0, 8),
        blockchain: String(w?.blockchain || "").toUpperCase(),
        addressPrefix: String(w?.address || "").slice(0, 10)
      }))
    : [];
  return {
    walletId: wallet?.id || "",
    address: wallet?.address || "",
    body,
    status: response.status
  };
}

function formatEvmNativeFromHex(hexValue) {
  try {
    const raw = BigInt(String(hexValue || "0x0"));
    const base = 10n ** 18n;
    const whole = raw / base;
    const frac = raw % base;
    const fracText = frac.toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
    return fracText ? `${whole.toString()}.${fracText}` : whole.toString();
  } catch (_err) {
    return "0";
  }
}

function parseEvmNativeFromHexNumber(hexValue) {
  try {
    const raw = BigInt(String(hexValue || "0x0"));
    return Number(raw) / 1e18;
  } catch (_err) {
    return 0;
  }
}

const POLYGON_AMOY_PUBLIC_RPC = [
  "https://polygon-amoy-bor-rpc.publicnode.com",
  "https://rpc-amoy.polygon.technology"
];

function uniqRpcEndpoints(urls) {
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) {
      continue;
    }
    seen.add(s);
    out.push(s);
  }
  return out;
}

function redactRpcUrlForDebug(value) {
  const s = String(value || "");
  if (/alchemy\.com\/v2\//i.test(s)) {
    return s.replace(/\/v2\/[^/?]+/i, "/v2/***");
  }
  return s;
}

function safeDebugPayload(value, depth = 0) {
  const maxDepth = 6;
  if (depth > maxDepth) {
    return "[max-depth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  const t = typeof value;
  if (t === "bigint") {
    return value.toString();
  }
  if (t === "number" || t === "boolean") {
    return value;
  }
  if (t === "string") {
    return redactRpcUrlForDebug(value);
  }
  if (t === "function") {
    return "[fn]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((v) => safeDebugPayload(v, depth + 1));
  }
  if (t === "object") {
    const out = {};
    for (const k of Object.keys(value).slice(0, 45)) {
      try {
        out[k] = safeDebugPayload(value[k], depth + 1);
      } catch (_e) {
        out[k] = "[unreadable]";
      }
    }
    return out;
  }
  return String(value);
}

function debugIngest(payload) {
  fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
    body: JSON.stringify({
      sessionId: "995d4d",
      runId: payload.runId || "run1",
      hypothesisId: payload.hypothesisId,
      location: payload.location,
      message: payload.message,
      data: payload.data,
      timestamp: Date.now()
    })
  }).catch(() => {});
}

function resolveBridgeDestinationChain(network, destinationNetworkKey) {
  const key = String(destinationNetworkKey || "").trim().toLowerCase();
  const base = network?.bridgeChain;
  if (!base) {
    return base;
  }
  if (key === "polygon-amoy") {
    const rest = Array.isArray(base.rpcEndpoints) ? [...base.rpcEndpoints] : [];
    const custom = POLYGON_AMOY_RPC_URL;
    const ordered = POLYGON_AMOY_RPC_PUBLIC_FIRST
      ? [...POLYGON_AMOY_PUBLIC_RPC, ...(custom ? [custom] : []), ...rest]
      : [...(custom ? [custom] : []), ...POLYGON_AMOY_PUBLIC_RPC, ...rest];
    return { ...base, rpcEndpoints: uniqRpcEndpoints(ordered) };
  }
  return base;
}

function flattenErrorForDebug(err, depth = 0, maxDepth = 10) {
  if (depth > maxDepth) {
    return "[max-depth]";
  }
  if (err == null) {
    return err;
  }
  const t = typeof err;
  if (t === "string" || t === "number" || t === "boolean") {
    return err;
  }
  if (t === "bigint") {
    return err.toString();
  }
  if (Array.isArray(err)) {
    return err.map((x) => flattenErrorForDebug(x, depth + 1, maxDepth));
  }
  if (t === "object") {
    const out = {};
    const keys = ["name", "message", "shortMessage", "details", "code", "type", "recoverability", "cause", "metaMessages", "version", "chain"];
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(err, k)) {
        try {
          out[k] = flattenErrorForDebug(err[k], depth + 1, maxDepth);
        } catch (_e) {
          out[k] = "[unreadable]";
        }
      }
    }
    if (Object.keys(out).length > 0) {
      return out;
    }
    try {
      return JSON.parse(JSON.stringify(err, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    } catch (_e2) {
      return String(err);
    }
  }
  return String(err);
}

function extractUserVisibleMintDetail(stepError) {
  if (!stepError) {
    return "";
  }
  const flat = flattenErrorForDebug(stepError, 0, 18);
  const pick =
    flat?.cause?.trace?.rawError?.cause?.details ||
    flat?.cause?.trace?.rawError?.details ||
    flat?.details;
  if (typeof pick === "string" && pick.trim()) {
    return pick.trim();
  }
  return "";
}

function summarizeBridgeStepFailure(bridgeResult) {
  const steps = bridgeResult?.steps;
  if (!Array.isArray(steps)) {
    return null;
  }
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (String(step?.state || "").toLowerCase() !== "error") {
      continue;
    }
    const err = step.error || {};
    const stepName = String(step.name || "unknown");
    const msg = String(step.errorMessage || err.shortMessage || err.message || "").trim();
    const userDetail =
      stepName.toLowerCase() === "mint" && step.error ? extractUserVisibleMintDetail(step.error).trim() : "";
    const displayMessage = userDetail || msg;
    return {
      stepName,
      errorMessage: msg,
      userDetail: userDetail || null,
      displayMessage,
      errorCode: err.code,
      errorName: err.name,
      errorType: err.type,
      recoverability: err.recoverability
    };
  }
  return null;
}

function resolveBridgeKitTransferConfig() {
  if (ARC_BRIDGE_TRANSFER_SPEED === "SLOW") {
    return { transferSpeed: TransferSpeed.SLOW };
  }
  if (ARC_BRIDGE_TRANSFER_SPEED === "FAST") {
    return { transferSpeed: TransferSpeed.FAST };
  }
  return {};
}

function extractUsdcBalanceForBlockchain(balanceList, blockchain) {
  if (!Array.isArray(balanceList)) {
    return 0;
  }
  const targetChain = String(blockchain || "").toUpperCase();
  const row = balanceList.find((item) => {
    const symbol = String(item?.tokenSymbol || item?.symbol || item?.token?.symbol || item?.token || "").toUpperCase();
    const chain = String(item?.blockchain || item?.chain || item?.token?.blockchain || "").toUpperCase();
    return symbol === "USDC" && chain === targetChain;
  });
  if (!row) {
    return 0;
  }
  const raw = row?.availableAmount || row?.amount || row?.balance || row?.amountFormatted || row?.amounts?.[0] || "0";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const decimals = Number(row?.token?.decimals);
  if (Number.isFinite(decimals) && decimals > 6 && parsed >= 1_000_000) {
    return parsed / 10 ** decimals;
  }
  return parsed;
}

async function resolveDestinationSignerFundingHint(destinationNetwork, fallbackAddress = "") {
  ensureCircleConfiguredForBridgeKit();
  const networkKey = String(destinationNetwork || "").trim().toLowerCase();
  const network = resolveOnlineNetwork(networkKey);
  if (!network) {
    const error = new Error(`Unsupported online execution network: ${destinationNetwork}`);
    error.code = "unsupported_online_network";
    error.status = 400;
    throw error;
  }
  const destinationWalletLookup = await fetchAnyCircleWalletAddressOnBlockchain(network.circleBlockchain);
  const destinationWalletId = destinationWalletLookup.walletId || "";
  const resolvedFallback = String(fallbackAddress || "").trim();
  const signerAddress = destinationWalletLookup.address || resolvedFallback || "";
  const signerSource = destinationWalletLookup.address ? "destination_wallet" : "source_wallet_fallback";
  const signerMatchesSourceWallet = Boolean(resolvedFallback) && signerAddress.toLowerCase() === resolvedFallback.toLowerCase();
  if (!signerAddress) {
    const error = new Error(
      `No destination signer wallet found for ${network.circleBlockchain}. Create/fund a Circle wallet on the destination chain first.`
    );
    error.code = "destination_signer_wallet_missing";
    error.status = 400;
    throw error;
  }
  const destinationRpcUrl =
    Array.isArray(network?.bridgeChain?.rpcEndpoints) && network.bridgeChain.rpcEndpoints.length > 0
      ? String(network.bridgeChain.rpcEndpoints[0])
      : "";
  const nativeProbe = destinationRpcUrl
    ? await probeEvmRpcNativeBalance(destinationRpcUrl, signerAddress)
    : { ok: false, status: -1, body: { error: "missing_destination_rpc_url" } };
  const nativeBalanceNumber = parseEvmNativeFromHexNumber(nativeProbe?.body?.result || "0x0");
  const minNativeRecommended = Number(DESTINATION_MIN_NATIVE_GAS[networkKey] || 0.001);
  let usdcBalance = 0;
  if (destinationWalletId) {
    const destinationBalances = await fetchCircleWalletBalances(destinationWalletId);
    const destinationBalanceList =
      destinationBalances?.body?.data?.tokenBalances ||
      destinationBalances?.body?.data?.balances ||
      destinationBalances?.body?.balances ||
      [];
    usdcBalance = extractUsdcBalanceForBlockchain(destinationBalanceList, network.circleBlockchain);
  }
  return {
    destination_network: networkKey,
    destination_chain: network.circleBlockchain,
    native_symbol: network.nativeSymbol,
    signer_address: signerAddress,
    signer_wallet_id: destinationWalletId,
    signer_source: signerSource,
    signer_matches_source_wallet: signerMatchesSourceWallet,
    signer_native_balance: formatEvmNativeFromHex(nativeProbe?.body?.result || "0x0"),
    signer_native_balance_number: Number(nativeBalanceNumber.toFixed(8)),
    signer_native_min_recommended: minNativeRecommended,
    signer_native_is_sufficient: nativeBalanceNumber >= minNativeRecommended,
    signer_usdc_balance: Number(usdcBalance.toFixed(6)),
    faucet_url: DESTINATION_GAS_FAUCETS[networkKey] || "",
    lookup_status: destinationWalletLookup.status || null
  };
}

async function fetchCircleWalletBalances(walletId) {
  const response = await fetch(`${CIRCLE_API_BASE}/v1/w3s/wallets/${encodeURIComponent(walletId)}/balances`, {
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
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function extractUsdcArcBalance(balanceList) {
  if (!Array.isArray(balanceList)) {
    return 0;
  }
  const row = balanceList.find((item) => {
    const symbol = String(item?.tokenSymbol || item?.symbol || item?.token?.symbol || item?.token || "").toUpperCase();
    const blockchain = String(item?.blockchain || item?.chain || item?.token?.blockchain || "").toUpperCase();
    return symbol === "USDC" && (blockchain === "ARC-TESTNET" || blockchain === "ARC_TESTNET");
  });
  if (!row) {
    return 0;
  }
  const raw =
    row?.availableAmount ||
    row?.amount ||
    row?.balance ||
    row?.amountFormatted ||
    row?.amounts?.[0] ||
    "0";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const decimals = Number(row?.token?.decimals);
  if (Number.isFinite(decimals) && decimals > 6 && parsed >= 1_000_000) {
    return parsed / 10 ** decimals;
  }
  return parsed;
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

async function probeArcRpcNativeBalance(address) {
  try {
    const response = await fetch(ARC_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"]
      })
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_err) {
      body = { raw: text };
    }
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      body: { error: error?.message || "rpc_probe_failed" }
    };
  }
}

async function probeEvmRpcNativeBalance(rpcUrl, address) {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"]
      })
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_err) {
      body = { raw: text };
    }
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      body: { error: error?.message || "rpc_probe_failed" }
    };
  }
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
  const balances = await fetchCircleWalletBalances(sourceWalletId);
  const balanceList =
    balances?.body?.data?.tokenBalances || balances?.body?.data?.balances || balances?.body?.balances || [];
  const availableUsdcArc = extractUsdcArcBalance(balanceList);
  const amount = (Number(amountMinor || 0) / 100).toFixed(2);
  const requested = Number(amount);
  const arcRpcProbe = await probeArcRpcNativeBalance(sourceAddress);
  const bridgeDestinationChain = resolveBridgeDestinationChain(network, destinationNetwork);
  const destinationRpcUrl =
    Array.isArray(bridgeDestinationChain?.rpcEndpoints) && bridgeDestinationChain.rpcEndpoints.length > 0
      ? String(bridgeDestinationChain.rpcEndpoints[0])
      : "";
  const adapter = getBridgeKitAdapter();
  const bridgeKit = getBridgeKit();
  const destinationWalletLookup = await fetchAnyCircleWalletAddressOnBlockchain(network.circleBlockchain);
  const destinationSignerAddress = destinationWalletLookup.address || sourceAddress;
  const destinationSourceAddressProbe = destinationRpcUrl
    ? await probeEvmRpcNativeBalance(destinationRpcUrl, sourceAddress)
    : { ok: false, status: -1, body: { error: "missing_destination_rpc_url" } };
  const destinationSignerAddressProbe = destinationRpcUrl
    ? await probeEvmRpcNativeBalance(destinationRpcUrl, destinationSignerAddress)
    : { ok: false, status: -1, body: { error: "missing_destination_rpc_url" } };

  if (!balances?.ok || availableUsdcArc < requested) {
    const error = new Error(
      `Online bridge source wallet has insufficient Arc USDC (available ${availableUsdcArc.toFixed(
        2
      )}, required ${requested.toFixed(2)}). Fund the Circle source wallet on Arc Testnet first.`
    );
    error.code = "arc_bridge_insufficient_source_balance";
    error.status = 400;
    throw error;
  }
  const minNativeRecommended = Number(DESTINATION_MIN_NATIVE_GAS[String(destinationNetwork || "").trim().toLowerCase()] || 0.001);
  const signerNativeWei = destinationSignerAddressProbe?.body?.result;
  const sourceOnDestNativeWei = destinationSourceAddressProbe?.body?.result;
  const signerNativeNumber = parseEvmNativeFromHexNumber(signerNativeWei || "0x0");
  const sourceOnDestNativeNumber = parseEvmNativeFromHexNumber(sourceOnDestNativeWei || "0x0");
  let rpcProbeHost = "";
  try {
    rpcProbeHost = destinationRpcUrl ? new URL(destinationRpcUrl).hostname : "";
  } catch (_e) {
    rpcProbeHost = "";
  }
  // #region agent log
  debugIngest({
    hypothesisId: "H-A",
    location: "cctpBridge.js:bridgeUsdcFromArc:pre_bridge_gas",
    message: "pre-bridge native gas vs threshold",
    data: {
      destinationNetwork,
      minNativeRecommended,
      signerNativeNumber,
      sourceOnDestNativeNumber,
      belowMinSigner: signerNativeNumber < minNativeRecommended,
      amount,
      requested,
      availableUsdcArc,
      rpcProbeHost,
      polygonAmoyPublicFirst:
        String(destinationNetwork || "")
          .trim()
          .toLowerCase() === "polygon-amoy"
          ? POLYGON_AMOY_RPC_PUBLIC_FIRST
          : null
    }
  });
  // #endregion
  // #region agent log
  debugIngest({
    hypothesisId: "H-C",
    location: "cctpBridge.js:bridgeUsdcFromArc:pre_bridge_signer",
    message: "signer routing",
    data: {
      destinationNetwork,
      circleBlockchain: network.circleBlockchain,
      walletIdPrefix: String(destinationWalletLookup.walletId || "").slice(0, 8),
      destSignerTail: String(destinationSignerAddress).slice(-8),
      sourceTail: String(sourceAddress).slice(-8),
      recipientTail: String(destination).slice(-8),
      signerIsSourceFallback: destinationSignerAddress.toLowerCase() === sourceAddress.toLowerCase()
    }
  });
  // #endregion
  if (signerNativeNumber < minNativeRecommended) {
    // #region agent log
    debugIngest({
      hypothesisId: "H-A",
      location: "cctpBridge.js:bridgeUsdcFromArc:preflight_low_gas",
      message: "low destination native gas before bridgeKit.bridge",
      runId: "post-fix",
      data: {
        destinationNetwork,
        signerNativeNumber,
        minNativeRecommended,
        nativeSymbol: network.nativeSymbol,
        allowLowDestinationGas: ALLOW_LOW_DESTINATION_GAS
      }
    });
    // #endregion
    if (!ALLOW_LOW_DESTINATION_GAS) {
      const error = new Error(
        `Destination signer has ~${signerNativeNumber.toFixed(4)} ${network.nativeSymbol} on ${network.keeperhubNetwork}; at least ${minNativeRecommended} ${network.nativeSymbol} is recommended before CCTP mint (avoids burn succeeding then mint failing). Fund the destination gas wallet or set ALLOW_LOW_DESTINATION_GAS=true to try anyway.`
      );
      error.code = "arc_bridge_insufficient_destination_gas";
      error.status = 400;
      error.details = {
        destination_network: destinationNetwork,
        signer_native: signerNativeNumber,
        min_native_recommended: minNativeRecommended,
        native_symbol: network.nativeSymbol
      };
      throw error;
    }
  }
  const bridgeKitTransferConfig = resolveBridgeKitTransferConfig();
  let bridgeResult;
  try {
    const bridgePayload = {
      from: {
        adapter,
        chain: ArcTestnet,
        address: sourceAddress
      },
      to: {
        adapter,
        chain: bridgeDestinationChain,
        address: destinationSignerAddress,
        recipientAddress: destination
      },
      amount,
      token: "USDC"
    };
    if (Object.keys(bridgeKitTransferConfig).length > 0) {
      bridgePayload.config = bridgeKitTransferConfig;
    }
    bridgeResult = await bridgeKit.bridge(bridgePayload);
  } catch (error) {
    // #region agent log
    debugIngest({
      hypothesisId: "H-E",
      location: "cctpBridge.js:bridgeUsdcFromArc:bridge_threw",
      message: "bridgeKit.bridge threw",
      data: {
        destinationNetwork,
        name: error?.name,
        code: error?.code,
        message: String(error?.message || "").slice(0, 500)
      }
    });
    // #endregion
    throw error;
  }
  const state = String(bridgeResult?.state || bridgeResult?.status || "success").toLowerCase();
  // #region agent log
  debugIngest({
    hypothesisId: "H-B",
    location: "cctpBridge.js:bridgeUsdcFromArc:post_bridge",
    message: "bridgeKit.bridge returned",
    data: {
      destinationNetwork,
      stateRaw: bridgeResult?.state ?? bridgeResult?.status,
      stateNormalized: state,
      transferSpeedRequested: bridgeKitTransferConfig.transferSpeed || null,
      bridgeSummary: safeDebugPayload(bridgeResult)
    }
  });
  // #endregion
  if (!["success", "succeeded", "complete", "completed"].includes(state)) {
    const mintErrStep = Array.isArray(bridgeResult?.steps)
      ? bridgeResult.steps.find(
          (s) => String(s?.name || "").toLowerCase() === "mint" && String(s?.state || "").toLowerCase() === "error"
        )
      : null;
    if (mintErrStep?.error) {
      // #region agent log
      debugIngest({
        hypothesisId: "H-H",
        location: "cctpBridge.js:bridgeUsdcFromArc:mint_error_flat",
        message: "flattened mint step error",
        data: {
          destinationNetwork,
          transferSpeedInResult: bridgeResult?.config?.transferSpeed ?? null,
          flat: flattenErrorForDebug(mintErrStep.error, 0, 12)
        }
      });
      // #endregion
    }
    const stepFailure = summarizeBridgeStepFailure(bridgeResult);
    const human = stepFailure?.displayMessage || stepFailure?.errorMessage || "";
    const suffix = human
      ? ` — ${stepFailure.stepName}: ${human}${stepFailure.errorName ? ` (${stepFailure.errorName})` : ""}`
      : "";
    const error = new Error(`Arc App Kit bridge did not complete successfully (state=${state})${suffix}`);
    error.code = "arc_bridge_failed";
    error.status = 502;
    error.bridge = bridgeResult;
    if (stepFailure) {
      error.bridge_step_failure = stepFailure;
    }
    throw error;
  }
  const transferId = extractBridgeTransferId(bridgeResult) || `arc-bridge-${Date.now().toString(36)}`;
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
  bridgeUsdcFromArc,
  resolveDestinationSignerFundingHint
};
