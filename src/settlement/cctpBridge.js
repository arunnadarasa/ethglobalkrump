"use strict";

const { BridgeKit, ArcTestnet, EthereumSepolia, BaseSepolia, PolygonAmoy, ArbitrumSepolia, AvalancheFuji } = require(
  "@circle-fin/bridge-kit"
);
const { createCircleWalletsAdapter } = require("@circle-fin/adapter-circle-wallets");

const CIRCLE_API_BASE = (process.env.CIRCLE_API_BASE || "https://api.circle.com").replace(/\/$/, "");
const CIRCLE_API_KEY = (process.env.CIRCLE_API_KEY || "").trim();
const CIRCLE_ENTITY_SECRET = (process.env.CIRCLE_ENTITY_SECRET || "").trim();
const CIRCLE_ENTITY_SECRET_RAW = (process.env.CIRCLE_ENTITY_SECRET_RAW || "").trim();
const ARC_RPC_URL = (process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network").trim();
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
    nativeSymbol: "MATIC"
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
  "polygon-amoy": 0.1,
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
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-destination-lookup-v1',hypothesisId:'H44',location:'src/settlement/cctpBridge.js:fetchAnyCircleWalletAddressOnBlockchain:http-error',message:'Destination wallet lookup failed at Circle wallets endpoint',data:{blockchain,status:response.status,hasMessage:Boolean(body?.message||body?.error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-destination-lookup-v1',hypothesisId:'H45',location:'src/settlement/cctpBridge.js:fetchAnyCircleWalletAddressOnBlockchain:ok',message:'Destination wallet lookup returned wallets',data:{requestedBlockchain:String(blockchain||'').toUpperCase(),walletCount:Array.isArray(wallets)?wallets.length:0,selectedWalletIdPrefix:String(wallet?.id||'').slice(0,8),selectedAddressPrefix:String(wallet?.address||'').slice(0,10),walletPreview},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-destination-lookup-v1',hypothesisId:'H46',location:'src/settlement/cctpBridge.js:resolveDestinationSignerFundingHint:selection',message:'Destination signer selected for funding hint',data:{destinationNetwork:networkKey,circleBlockchain:network.circleBlockchain,lookupWalletIdPrefix:String(destinationWalletId||'').slice(0,8),lookupAddressPrefix:String(destinationWalletLookup.address||'').slice(0,10),fallbackAddressPrefix:String(fallbackAddress||'').slice(0,10),usedFallbackAddress:!destinationWalletLookup.address&&Boolean(fallbackAddress),signerAddressPrefix:String(signerAddress||'').slice(0,10)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
  const destinationRpcUrl =
    Array.isArray(network?.bridgeChain?.rpcEndpoints) && network.bridgeChain.rpcEndpoints.length > 0
      ? String(network.bridgeChain.rpcEndpoints[0])
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
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-arc-bridge-v8',hypothesisId:'H33',location:'src/settlement/cctpBridge.js:bridgeUsdcFromArc:entry',message:'Bridge request with destination signer and dual destination probes',data:{destinationNetwork,bridgeChainId:network.bridgeChainId,circleDestinationChain:network.circleBlockchain,amount,hasSourceWalletId:Boolean(sourceWalletId),sourceWalletIdPrefix:String(sourceWalletId||'').slice(0,8),sourceAddressPrefix:sourceAddress.slice(0,10),destinationSignerPrefix:destinationSignerAddress.slice(0,10),destinationSignerFromLookup:Boolean(destinationWalletLookup.address),destinationLookupStatus:destinationWalletLookup.status||null,recipientPrefix:destination.slice(0,10),hasMemo:Boolean(memo),balanceQueryOk:Boolean(balances?.ok),balanceQueryStatus:balances?.status||null,balanceCount:Array.isArray(balanceList)?balanceList.length:0,availableUsdcArc,arcRpcProbeOk:Boolean(arcRpcProbe?.ok),arcRpcProbeStatus:arcRpcProbe?.status||null,arcRpcProbeBody:arcRpcProbe?.body||{},destinationRpcUrl,destinationSourceAddressProbe:destinationSourceAddressProbe?.body||{},destinationSignerAddressProbe:destinationSignerAddressProbe?.body||{}},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-arc-bridge-v2',hypothesisId:'H19',location:'src/settlement/cctpBridge.js:bridgeUsdcFromArc:balances',message:'Source wallet balances before bridge',data:{sourceWalletIdPrefix:String(sourceWalletId||'').slice(0,8),balancesPreview:Array.isArray(balanceList)?balanceList.slice(0,5):[]},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
  let bridgeResult;
  try {
    bridgeResult = await bridgeKit.bridge({
      from: {
        adapter,
        chain: ArcTestnet,
        address: sourceAddress
      },
      to: {
        adapter,
        chain: network.bridgeChain,
        address: destinationSignerAddress,
        recipientAddress: destination
      },
      amount,
      token: "USDC"
    });
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'995d4d'},body:JSON.stringify({sessionId:'995d4d',runId:'online-arc-bridge-v8',hypothesisId:'H34',location:'src/settlement/cctpBridge.js:bridgeUsdcFromArc:error',message:'Bridge call failed after dual destination probes',data:{errorName:error?.name||null,errorCode:error?.code||null,errorMessage:error?.message||null,destinationSignerPrefix:destinationSignerAddress.slice(0,10),destinationSignerFromLookup:Boolean(destinationWalletLookup.address),recipientPrefix:destination.slice(0,10),arcRpcProbeBody:arcRpcProbe?.body||{},destinationRpcUrl,destinationSourceAddressProbe:destinationSourceAddressProbe?.body||{},destinationSignerAddressProbe:destinationSignerAddressProbe?.body||{}},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw error;
  }
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
  bridgeUsdcFromArc,
  resolveDestinationSignerFundingHint
};
