require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const path = require("path");
const {
  CheckoutCreateRequestSchema,
  UcpCheckoutResponseSchema,
  UcpOrderResponseSchema
} = require("@ucp-js/sdk");
const {
  dancers,
  tutorialClips,
  entries,
  payments,
  payouts,
  unlocks,
  feedbackRequests,
  practiceRooms,
  practiceBookings,
  samplePacks,
  issuedLicenses,
  challenges,
  challengeSubmissions,
  challengePayouts,
  crews,
  crewSettlements,
  merchCatalog,
  merchOrders,
  helpers
} = require("./state");
const { makeAgentOrchestrator } = require("./agents/orchestrator");
const { createVyperSettlementPolicy } = require("./settlement/vyperPolicy");
const keeperhub = require("./keeperhub/client");

const app = express();
const PORT = process.env.PORT || 3000;
const CIRCLE_API_BASE = process.env.CIRCLE_API_BASE || "https://api.circle.com";
const CIRCLE_TRANSFER_PATH = process.env.CIRCLE_TRANSFER_PATH || "/v1/w3s/developer/transactions/transfer";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || "";
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || "";
const CIRCLE_ENTITY_SECRET_CIPHERTEXT = process.env.CIRCLE_ENTITY_SECRET_CIPHERTEXT || "";
const CIRCLE_ENTITY_SECRET_RAW = process.env.CIRCLE_ENTITY_SECRET_RAW || "";
const CIRCLE_WALLET_ID = process.env.CIRCLE_WALLET_ID || "";
const CIRCLE_DESTINATION_ADDRESS = process.env.CIRCLE_DESTINATION_ADDRESS || "";
const CIRCLE_TOKEN_ID = process.env.CIRCLE_TOKEN_ID || "";
const CIRCLE_TOKEN_ADDRESS = process.env.CIRCLE_TOKEN_ADDRESS || "";
const CIRCLE_TOKEN_BLOCKCHAIN = process.env.CIRCLE_TOKEN_BLOCKCHAIN || "ARC-TESTNET";
const CIRCLE_WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID || "";

const ARCTESTNET_CHAIN_ID = process.env.ARC_CHAIN_ID || "5042002";
const ARCTESTNET_CHAIN_ID_HEX = `0x${Number(ARCTESTNET_CHAIN_ID).toString(16)}`;
const ARCTESTNET_RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const ARCTESTNET_NAME = process.env.ARC_CHAIN_NAME || "Arc Testnet";
const ARCTESTNET_SYMBOL = process.env.ARC_NATIVE_SYMBOL || "USDC";
const ONCHAIN_TREASURY_ADDRESS = process.env.ONCHAIN_TREASURY_ADDRESS || "";
const ENABLE_VYPER_SETTLEMENT = String(process.env.ENABLE_VYPER_SETTLEMENT || "").toLowerCase() === "true";
const ERC8004_AGENT_REGISTRY = process.env.ERC8004_AGENT_REGISTRY || "";
const ERC8004_AGENT_ID = process.env.ERC8004_AGENT_ID || "";
const ERC8004_AGENT_TOKEN_URI = process.env.ERC8004_AGENT_TOKEN_URI || "";
const ERC8004_AGENT_CAPABILITIES_URI = process.env.ERC8004_AGENT_CAPABILITIES_URI || "";
let activeCircleWalletId = CIRCLE_WALLET_ID;
let activeCircleWalletSetId = CIRCLE_WALLET_SET_ID;
const vyperSettlement = createVyperSettlementPolicy();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: {
      code,
      message
    }
  });
}

function listLeaderboard() {
  return dancers
    .map((dancer) => ({
      id: dancer.id,
      name: dancer.name,
      tips_minor: dancer.tipsMinor,
      tips_usd: helpers.toUsd(dancer.tipsMinor)
    }))
    .sort((a, b) => b.tips_minor - a.tips_minor);
}

function getBattleClosed() {
  const state = require("./state");
  return state.battleClosed;
}

function setBattleClosed(value) {
  const state = require("./state");
  state.battleClosed = value;
}

function getRailConfig() {
  const hasTokenSelector = Boolean(CIRCLE_TOKEN_ID || (CIRCLE_TOKEN_ADDRESS && CIRCLE_TOKEN_BLOCKCHAIN));
  return {
    rails: {
      metamask: {
        chain_id: Number(ARCTESTNET_CHAIN_ID),
        chain_id_hex: ARCTESTNET_CHAIN_ID_HEX,
        chain_name: ARCTESTNET_NAME,
        rpc_url: ARCTESTNET_RPC_URL,
        symbol: ARCTESTNET_SYMBOL,
        treasury_address: ONCHAIN_TREASURY_ADDRESS
      },
      circle: {
        enabled: Boolean(CIRCLE_API_KEY && CIRCLE_ENTITY_SECRET && activeCircleWalletId && hasTokenSelector),
        wallet_id: activeCircleWalletId,
        wallet_set_id: activeCircleWalletSetId,
        token_id: CIRCLE_TOKEN_ID,
        token_address: CIRCLE_TOKEN_ADDRESS,
        token_blockchain: CIRCLE_TOKEN_BLOCKCHAIN,
        destination_address: CIRCLE_DESTINATION_ADDRESS || ONCHAIN_TREASURY_ADDRESS,
        api_base: CIRCLE_API_BASE,
        transfer_path: CIRCLE_TRANSFER_PATH
      },
      keeperhub: {
        api_key_configured: keeperhub.isConfigured(),
        api_base: keeperhub.getBaseUrl()
      }
    }
  };
}

function getAgentIdentityMetadata() {
  return {
    standard: "erc-8004-style",
    agent_registry: ERC8004_AGENT_REGISTRY || null,
    agent_id: ERC8004_AGENT_ID || null,
    token_uri: ERC8004_AGENT_TOKEN_URI || null,
    capabilities_uri: ERC8004_AGENT_CAPABILITIES_URI || null
  };
}

function getUcpBaseUrl(req) {
  const host = req.get("host") || `localhost:${PORT}`;
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  return `${proto}://${host}`;
}

function buildUcpCapabilities() {
  return [
    {
      name: "checkout_create",
      version: "1.0.0",
      schema: "https://ucp.dev/latest/schemas/checkout/create-request.json",
      spec: "https://ucp.dev/latest/specification/checkout/"
    },
    {
      name: "order_status",
      version: "1.0.0",
      schema: "https://ucp.dev/latest/schemas/order/response.json",
      spec: "https://ucp.dev/latest/specification/order/"
    }
  ];
}

function makeUuid() {
  return crypto.randomUUID();
}

function createUcpCheckoutResponse(payload) {
  const parsedRequest = CheckoutCreateRequestSchema.safeParse(payload || {});
  if (!parsedRequest.success) {
    const validationIssue = parsedRequest.error.issues[0]?.message || "invalid payload";
    const error = new Error(`UCP checkout request validation failed: ${validationIssue}`);
    error.code = "ucp_checkout_invalid";
    error.status = 400;
    throw error;
  }

  const normalizedLineItems = (parsedRequest.data.line_items || []).map((lineItem) => {
    const clip = tutorialClips.find((item) => item.id === lineItem.item.id);
    const unitMinor = clip ? clip.priceMinor : 100;
    return {
      item_id: lineItem.item.id,
      quantity: lineItem.quantity,
      unit_minor: unitMinor,
      line_total_minor: unitMinor * lineItem.quantity
    };
  });
  const totalMinor = normalizedLineItems.reduce((sum, item) => sum + item.line_total_minor, 0);
  const checkoutId = helpers.makeId("ucp-checkout");

  const checkoutResponseCore = {
    version: "1.0.0",
    capabilities: buildUcpCapabilities().map(({ name, version }) => ({ name, version }))
  };
  const validatedResponse = UcpCheckoutResponseSchema.safeParse(checkoutResponseCore);
  if (!validatedResponse.success) {
    const error = new Error("UCP checkout response schema validation failed.");
    error.code = "ucp_checkout_response_invalid";
    error.status = 500;
    throw error;
  }

  return {
    ...validatedResponse.data,
    checkout: {
      id: checkoutId,
      currency: parsedRequest.data.currency,
      line_items: normalizedLineItems,
      total_minor: totalMinor,
      total_usd: helpers.toUsd(totalMinor),
      status: "created"
    }
  };
}

function createUcpOrderResponse(orderId) {
  const relatedPayment = payments.find((payment) => payment.id === orderId) || null;
  const orderResponseCore = {
    version: "1.0.0",
    capabilities: buildUcpCapabilities().map(({ name, version }) => ({ name, version }))
  };
  const validated = UcpOrderResponseSchema.safeParse(orderResponseCore);
  if (!validated.success) {
    const error = new Error("UCP order response schema validation failed.");
    error.code = "ucp_order_response_invalid";
    error.status = 500;
    throw error;
  }

  return {
    ...validated.data,
    order: {
      id: orderId,
      status: relatedPayment ? relatedPayment.status : "unknown",
      payment_mode: relatedPayment?.payment_mode || null,
      amount_minor: relatedPayment?.amount_minor || null,
      amount_usd:
        typeof relatedPayment?.amount_minor === "number" ? helpers.toUsd(relatedPayment.amount_minor) : null
    }
  };
}

async function circlePost(pathname, payload) {
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
  } catch (_error) {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = body?.message || body?.error || `Circle API ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
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
  } catch (_error) {
    body = { raw: text };
  }
  if (!response.ok) {
    const detail = body?.message || body?.error || `Circle API ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return body;
}

function asPemPublicKey(publicKeyRaw) {
  if (!publicKeyRaw) {
    throw new Error("Empty Circle public key");
  }
  if (publicKeyRaw.includes("BEGIN PUBLIC KEY")) {
    return publicKeyRaw;
  }
  const lines = publicKeyRaw.replace(/\s+/g, "").match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

function normalizeEntitySecretBytes(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("Entity secret missing. Provide the registered raw entity secret.");
  }
  // 32-byte secret as 64-char hex
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  // Raw base64 that decodes to 32 bytes
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, "base64");
      if (decoded.length === 32) {
        return decoded;
      }
    } catch (_error) {
      // continue to final error
    }
  }
  throw new Error(
    "Invalid entity secret format. Provide 32-byte raw secret as 64-char hex or base64 that decodes to 32 bytes."
  );
}

async function generateEntitySecretCiphertext(entitySecretRaw) {
  if (!CIRCLE_API_KEY) {
    throw new Error("Circle API key missing");
  }
  if (!entitySecretRaw) {
    throw new Error(
      "Entity secret missing. Provide the registered raw entity secret in UI or set CIRCLE_ENTITY_SECRET_RAW."
    );
  }
  const keyResult = await circleGet("/v1/w3s/config/entity/publicKey");
  const publicKeyRaw = keyResult?.data?.publicKey;
  const pem = asPemPublicKey(publicKeyRaw);
  const secretBytes = normalizeEntitySecretBytes(entitySecretRaw);
  const encrypted = crypto.publicEncrypt(
    {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    secretBytes
  );
  return encrypted.toString("base64");
}

async function ensureCircleWalletSet(walletSetName, entitySecretCiphertext) {
  if (activeCircleWalletSetId) {
    return activeCircleWalletSetId;
  }
  const payload = {
    idempotencyKey: makeUuid(),
    entitySecretCiphertext,
    name: walletSetName || "krump-wallet-set"
  };
  const response = await circlePost("/v1/w3s/developer/walletSets", payload);
  const walletSetId = response?.data?.walletSet?.id || response?.data?.id || null;
  if (!walletSetId) {
    throw new Error("Circle wallet set creation succeeded but no wallet set id was returned");
  }
  activeCircleWalletSetId = walletSetId;
  return walletSetId;
}

async function createCircleWallet({ blockchain, walletSetId, walletName, entitySecretCiphertext, entitySecretRaw }) {
  if (!CIRCLE_API_KEY) {
    throw new Error("Circle credentials missing: set CIRCLE_API_KEY");
  }
  const fallbackCiphertext = entitySecretCiphertext || CIRCLE_ENTITY_SECRET_CIPHERTEXT || CIRCLE_ENTITY_SECRET;
  if (!fallbackCiphertext && !entitySecretRaw && !CIRCLE_ENTITY_SECRET_RAW) {
    throw new Error(
      "Missing entity secret material: provide entity_secret_raw or entity_secret_ciphertext."
    );
  }
  const rawSecret = entitySecretRaw || CIRCLE_ENTITY_SECRET_RAW || "";

  let resolvedWalletSetId = walletSetId;
  if (!resolvedWalletSetId) {
    if (!rawSecret) {
      throw new Error(
        "wallet_set_id is required when only entity_secret_ciphertext is provided. Provide entity_secret_raw to auto-generate unique ciphertexts."
      );
    }
    const setCiphertext = await generateEntitySecretCiphertext(rawSecret);
    resolvedWalletSetId = await ensureCircleWalletSet("krump-wallet-set", setCiphertext);
  }

  const walletCiphertext = rawSecret ? await generateEntitySecretCiphertext(rawSecret) : fallbackCiphertext;
  const payload = {
    idempotencyKey: makeUuid(),
    entitySecretCiphertext: walletCiphertext,
    walletSetId: resolvedWalletSetId,
    blockchains: [blockchain || "ARC-TESTNET"],
    accountType: "EOA",
    count: 1
  };
  if (walletName) {
    payload.metadata = [{ name: walletName }];
  }
  const response = await circlePost("/v1/w3s/developer/wallets", payload);
  const createdWallet =
    response?.data?.wallets?.[0] ||
    response?.data?.wallet ||
    response?.data ||
    null;
  const createdWalletId = createdWallet?.id;
  if (!createdWalletId) {
    throw new Error("Circle wallet creation succeeded but no wallet id was returned");
  }
  activeCircleWalletId = createdWalletId;
  activeCircleWalletSetId = resolvedWalletSetId;
  return {
    wallet: createdWallet,
    walletSetId: resolvedWalletSetId,
    raw: response
  };
}

async function createCircleTransfer({ amountMinor, memo, walletId }) {
  const resolvedWalletId = walletId || activeCircleWalletId || CIRCLE_WALLET_ID;
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v1',hypothesisId:'T5',location:'src/server.js:createCircleTransfer:entry',message:'Create circle transfer called',data:{amountMinor,hasApiKey:Boolean(CIRCLE_API_KEY),hasEntitySecret:Boolean(CIRCLE_ENTITY_SECRET),hasActiveWalletId:Boolean(activeCircleWalletId),hasResolvedWalletId:Boolean(resolvedWalletId),activeWalletIdPrefix:activeCircleWalletId?String(activeCircleWalletId).slice(0,8):null,resolvedWalletIdPrefix:resolvedWalletId?String(resolvedWalletId).slice(0,8):null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!CIRCLE_API_KEY || !resolvedWalletId) {
    throw new Error("Circle credentials missing: set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_ID");
  }
  if (ENABLE_VYPER_SETTLEMENT) {
    const policyCheck = vyperSettlement.evaluate({
      agentId: "payments-agent",
      amountMinor,
      intent: "circle_transfer"
    });
    if (!policyCheck.approved) {
      throw new Error(`Vyper settlement policy blocked transfer: ${policyCheck.reasons.join(", ")}`);
    }
  }
  const rawSecret = CIRCLE_ENTITY_SECRET_RAW || "";
  const fallbackCiphertext = CIRCLE_ENTITY_SECRET_CIPHERTEXT || CIRCLE_ENTITY_SECRET || "";
  const transferCiphertext = rawSecret ? await generateEntitySecretCiphertext(rawSecret) : fallbackCiphertext;
  if (!transferCiphertext) {
    throw new Error(
      "Circle transfer requires entity secret material: set CIRCLE_ENTITY_SECRET_RAW or CIRCLE_ENTITY_SECRET_CIPHERTEXT."
    );
  }
  activeCircleWalletId = resolvedWalletId;
  const hasTokenId = Boolean(CIRCLE_TOKEN_ID);
  const hasTokenAddressSelector = Boolean(CIRCLE_TOKEN_ADDRESS && CIRCLE_TOKEN_BLOCKCHAIN);
  if (!hasTokenId && !hasTokenAddressSelector) {
    throw new Error(
      "Circle token missing: set CIRCLE_TOKEN_ID or set CIRCLE_TOKEN_ADDRESS + CIRCLE_TOKEN_BLOCKCHAIN"
    );
  }

  const destinationAddress = CIRCLE_DESTINATION_ADDRESS || ONCHAIN_TREASURY_ADDRESS;
  if (!destinationAddress) {
    throw new Error("Missing destination address: set CIRCLE_DESTINATION_ADDRESS or ONCHAIN_TREASURY_ADDRESS");
  }

  const amount = (amountMinor / 100).toFixed(2);
  const payload = {
    walletId: resolvedWalletId,
    entitySecretCiphertext: transferCiphertext,
    destinationAddress,
    amounts: [amount],
    feeLevel: "MEDIUM",
    idempotencyKey: makeUuid(),
    metadata: {
      memo: memo || "krump-ucp-demo"
    }
  };
  if (hasTokenId) {
    payload.tokenId = CIRCLE_TOKEN_ID;
  } else {
    payload.tokenAddress = CIRCLE_TOKEN_ADDRESS;
    payload.blockchain = CIRCLE_TOKEN_BLOCKCHAIN;
  }
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v2',hypothesisId:'T8',location:'src/server.js:createCircleTransfer:payload',message:'Circle transfer payload prepared',data:{walletIdPrefix:String(payload.walletId||'').slice(0,8),amounts:payload.amounts,hasEntitySecretCiphertext:Boolean(payload.entitySecretCiphertext),hasTokenId:Boolean(payload.tokenId),hasTokenAddress:Boolean(payload.tokenAddress),blockchain:payload.blockchain||null,destinationPrefix:String(payload.destinationAddress||'').slice(0,10)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const response = await fetch(`${CIRCLE_API_BASE}${CIRCLE_TRANSFER_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      "Content-Type": "application/json",
      "X-Entity-Secret": CIRCLE_ENTITY_SECRET
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_error) {
    body = { raw: text };
  }
  if (!response.ok) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v2',hypothesisId:'T9',location:'src/server.js:createCircleTransfer:api-error',message:'Circle API rejected transfer payload',data:{status:response.status,bodyKeys:Object.keys(body||{}),errorMessage:body?.message||body?.error||null,errorCode:body?.code||body?.errorCode||null,errors:body?.errors||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const detail = body?.message || body?.error || `Circle API ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return {
    request: payload,
    response: body
  };
}

async function getCircleWalletBalances(walletId) {
  if (!CIRCLE_API_KEY) {
    throw new Error("Circle credentials missing: set CIRCLE_API_KEY");
  }
  if (!walletId) {
    throw new Error("Circle wallet id missing");
  }
  const candidatePaths = [
    `/v1/w3s/wallets/${walletId}/balances`,
    `/v1/w3s/developer/wallets/${walletId}/balances`
  ];
  let lastError = null;
  for (const pathname of candidatePaths) {
    try {
      const body = await circleGet(pathname);
      const balances = body?.data?.tokenBalances || body?.data?.balances || body?.data || [];
      return { pathname, balances, raw: body };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError?.message || "Failed to fetch Circle wallet balances");
}

app.get("/api/config", (_req, res) => {
  res.json(getRailConfig());
});

app.get("/api/keeperhub/status", async (_req, res) => {
  try {
    const summary = await keeperhub.getStatusSummary(ARCTESTNET_CHAIN_ID);
    return res.json({ ok: true, ...summary });
  } catch (error) {
    return sendError(res, 500, "keeperhub_status_failed", error.message);
  }
});

app.get("/api/keeperhub/chains", async (req, res) => {
  try {
    if (!keeperhub.isConfigured()) {
      return sendError(res, 400, "keeperhub_not_configured", "Set KEEPERHUB_API_KEY to list chains");
    }
    const includeDisabled = String(req.query.includeDisabled || "").toLowerCase() === "true";
    const chains = await keeperhub.listChains({ includeDisabled });
    return res.json({
      ok: true,
      arc_chain_id: Number(ARCTESTNET_CHAIN_ID),
      matched: keeperhub.pickArcChain(chains, ARCTESTNET_CHAIN_ID),
      chains
    });
  } catch (error) {
    return sendError(res, error.status || 502, "keeperhub_chains_failed", error.message);
  }
});

app.post("/api/keeperhub/execute-transfer", async (req, res) => {
  try {
    if (!keeperhub.isConfigured()) {
      return sendError(res, 400, "keeperhub_not_configured", "Set KEEPERHUB_API_KEY");
    }
    const { recipient_address, amount_minor } = req.body || {};
    if (!recipient_address || typeof recipient_address !== "string") {
      return sendError(res, 400, "invalid_recipient", "recipient_address is required");
    }
    if (!Number.isInteger(amount_minor) || amount_minor < 1) {
      return sendError(res, 400, "invalid_amount", "amount_minor must be an integer >= 1");
    }
    const summary = await keeperhub.getStatusSummary(ARCTESTNET_CHAIN_ID);
    if (!summary.execute_network) {
      return sendError(
        res,
        400,
        "keeperhub_no_network",
        "Arc testnet not found in KeeperHub chain list, or could not derive slug. Set KEEPERHUB_EXECUTE_NETWORK (see README)."
      );
    }
    const transfer = await keeperhub.executeTransferPayout({
      recipientAddress: recipient_address.trim(),
      amountMinor: amount_minor,
      network: summary.execute_network
    });
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-token-debug',hypothesisId:'T4',location:'src/server.js:/api/keeperhub/execute-transfer',message:'KeeperHub transfer response received',data:{status:transfer?.status||null,executionId:transfer?.executionId||null,arcSupported:summary.arc_supported,executeNetwork:summary.execute_network},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    let execution_status = null;
    if (transfer?.executionId) {
      try {
        execution_status = await keeperhub.getExecutionStatus(transfer.executionId);
      } catch (_e) {
        execution_status = null;
      }
    }
    return res.status(201).json({ ok: true, keeperhub: transfer, execution_status: execution_status, arc: summary });
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'keeperhub-token-debug',hypothesisId:'T5',location:'src/server.js:/api/keeperhub/execute-transfer:catch',message:'KeeperHub transfer route failed',data:{status:error.status||null,errorMessage:error.message||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return sendError(res, error.status || 502, "keeperhub_transfer_failed", error.message);
  }
});

app.get("/api/ucp/discovery", (req, res) => {
  const baseUrl = getUcpBaseUrl(req);
  return res.json({
    ucp: {
      version: "1.0.0",
      capabilities: buildUcpCapabilities(),
      services: {
        version: "1.0.0",
        spec: "https://ucp.dev/latest/specification/overview/",
        rest: {
          endpoint: `${baseUrl}/api/ucp`,
          schema: "https://ucp.dev/latest/schemas/discovery/profile.json",
          version: "1.0.0",
          spec: "https://ucp.dev/latest/specification/rest/"
        }
      }
    }
  });
});

const agentOrchestrator = makeAgentOrchestrator({
  helpers,
  tutorialClips,
  createCheckout: createUcpCheckoutResponse,
  getOrderStatus: createUcpOrderResponse,
  evaluateSettlementPolicy: ENABLE_VYPER_SETTLEMENT ? vyperSettlement.evaluate : null,
  getAgentIdentity: getAgentIdentityMetadata
});

app.get("/api/agents/capabilities", (_req, res) => {
  return res.json({
    agents: {
      ...agentOrchestrator.listCapabilities(),
      settlement_mode: ENABLE_VYPER_SETTLEMENT ? "vyper_policy_enabled" : "circle_default",
      keeperhub_execution: keeperhub.isConfigured()
    }
  });
});

app.get("/api/agents/identity", (_req, res) => {
  return res.json({
    ok: true,
    identity: getAgentIdentityMetadata()
  });
});

app.post("/api/settlement/vyper/evaluate", (req, res) => {
  const { agent_id, amount_minor, intent } = req.body || {};
  const result = vyperSettlement.evaluate({
    agentId: agent_id || "payments-agent",
    amountMinor: Number(amount_minor || 0),
    intent: intent || "manual_check"
  });
  return res.json({
    ok: result.approved,
    result
  });
});

app.post("/api/agents/sessions", (req, res) => {
  const { intent, context } = req.body || {};
  if (!intent || typeof intent !== "string") {
    return sendError(res, 400, "agent_intent_required", "intent is required and must be a string");
  }
  const allowedIntents = new Set(["tip_dancer", "unlock_clip", "battle_entry", "merch_concierge_checkout"]);
  if (!allowedIntents.has(intent)) {
    return sendError(res, 400, "agent_intent_unsupported", `Unsupported intent: ${intent}`);
  }
  const session = agentOrchestrator.runSession(intent, context || {});
  const statusCode = session.status === "failed" ? 502 : 201;
  return res.status(statusCode).json({
    ok: session.status === "completed",
    session
  });
});

app.get("/api/agents/sessions/:sessionId", (req, res) => {
  const session = agentOrchestrator.getSession(req.params.sessionId);
  if (!session) {
    return sendError(res, 404, "agent_session_not_found", "Unknown agent session id");
  }
  return res.json({
    ok: true,
    session
  });
});

app.post("/api/ucp/checkout/create", (req, res) => {
  try {
    return res.status(201).json(createUcpCheckoutResponse(req.body || {}));
  } catch (error) {
    return sendError(res, error.status || 500, error.code || "ucp_checkout_failed", error.message);
  }
});

app.get("/api/ucp/orders/:orderId", (req, res) => {
  try {
    return res.json(createUcpOrderResponse(req.params.orderId));
  } catch (error) {
    return sendError(res, error.status || 500, error.code || "ucp_order_failed", error.message);
  }
});

app.get("/api/ucp/conformance/self-test", (_req, res) => {
  const sampleCheckoutRequest = {
    currency: "USD",
    line_items: [{ item: { id: "clip-1" }, quantity: 1 }],
    payment: {
      instruments: [{ id: "card-1", handler_id: "stripe", type: "card", brand: "visa", last_digits: "4242" }],
      selected_instrument_id: "card-1"
    }
  };
  const sampleCheckoutResponse = {
    version: "1.0.0",
    capabilities: [{ name: "checkout_create", version: "1.0.0" }]
  };
  const sampleOrderResponse = {
    version: "1.0.0",
    capabilities: [{ name: "order_status", version: "1.0.0" }]
  };

  const checks = {
    checkout_create_request: CheckoutCreateRequestSchema.safeParse(sampleCheckoutRequest).success,
    checkout_response: UcpCheckoutResponseSchema.safeParse(sampleCheckoutResponse).success,
    order_response: UcpOrderResponseSchema.safeParse(sampleOrderResponse).success
  };
  const passed = Object.values(checks).every(Boolean);
  return res.json({
    ok: passed,
    source: "@ucp-js/sdk",
    checks
  });
});

app.post("/api/circle/wallets/create", async (req, res) => {
  try {
    const { blockchain, wallet_set_id, wallet_name, entity_secret_ciphertext, entity_secret_raw } = req.body || {};
    const created = await createCircleWallet({
      blockchain: blockchain || "ARC-TESTNET",
      walletSetId: wallet_set_id || "",
      walletName: wallet_name || "",
      entitySecretCiphertext: entity_secret_ciphertext || "",
      entitySecretRaw: entity_secret_raw || ""
    });
    return res.status(201).json({
      ok: true,
      active_wallet_id: activeCircleWalletId,
      active_wallet_set_id: activeCircleWalletSetId,
      result: created
    });
  } catch (error) {
    return sendError(res, 502, "circle_wallet_create_failed", error.message);
  }
});

app.post("/api/circle/entity-secret-ciphertext/generate", async (req, res) => {
  try {
    const { entity_secret_raw } = req.body || {};
    const sourceSecret = entity_secret_raw || CIRCLE_ENTITY_SECRET_RAW || "";
    const ciphertext = await generateEntitySecretCiphertext(sourceSecret);
    return res.status(201).json({ ok: true, entity_secret_ciphertext: ciphertext });
  } catch (error) {
    return sendError(res, 502, "circle_ciphertext_generate_failed", error.message);
  }
});

app.post("/api/payments/circle/transfer", async (req, res) => {
  try {
    const { amount_minor, memo, wallet_id } = req.body || {};
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v1',hypothesisId:'T6',location:'src/server.js:/api/payments/circle/transfer:entry',message:'Circle transfer endpoint called',data:{amountMinor:amount_minor||null,hasApiKey:Boolean(CIRCLE_API_KEY),hasEntitySecret:Boolean(CIRCLE_ENTITY_SECRET),hasActiveWalletId:Boolean(activeCircleWalletId),hasWalletIdFromRequest:Boolean(wallet_id),envWalletIdPrefix:CIRCLE_WALLET_ID?String(CIRCLE_WALLET_ID).slice(0,8):null,activeWalletIdPrefix:activeCircleWalletId?String(activeCircleWalletId).slice(0,8):null,walletIdFromRequestPrefix:wallet_id?String(wallet_id).slice(0,8):null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!Number.isInteger(amount_minor) || amount_minor < 1) {
      return sendError(res, 400, "invalid_amount", "amount_minor must be an integer >= 1");
    }
    const transfer = await createCircleTransfer({ amountMinor: amount_minor, memo, walletId: wallet_id || "" });
    return res.status(201).json({
      payment_mode: "circle_wallet",
      amount_minor,
      amount_usd: helpers.toUsd(amount_minor),
      transfer
    });
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v1',hypothesisId:'T7',location:'src/server.js:/api/payments/circle/transfer:error',message:'Circle transfer endpoint failed',data:{errorMessage:error.message},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return sendError(res, 502, "circle_transfer_failed", error.message);
  }
});

app.get("/api/circle/wallets/:walletId/balances", async (req, res) => {
  try {
    const walletId = req.params.walletId || activeCircleWalletId || "";
    const result = await getCircleWalletBalances(walletId);
    return res.json({
      ok: true,
      wallet_id: walletId,
      balance_source: result.pathname,
      balances: result.balances,
      raw: result.raw
    });
  } catch (error) {
    return sendError(res, 502, "circle_balance_fetch_failed", error.message);
  }
});

// U1: Live battle tipping
app.get("/api/tips/leaderboard", (_req, res) => {
  res.json({
    track: "U1",
    leaderboard: listLeaderboard(),
    settlement_network: "Arc_Testnet",
    payment_rail: "Circle_Gateway_Nanopayments"
  });
});

app.post("/api/tips", (req, res) => {
  const { fan_name, dancer_id, amount_minor, payment_mode, payment_ref } = req.body || {};
  const dancer = dancers.find((item) => item.id === dancer_id);
  if (!dancer) {
    return sendError(res, 404, "dancer_not_found", "Unknown dancer_id");
  }
  if (!Number.isInteger(amount_minor) || amount_minor < 1) {
    return sendError(res, 400, "invalid_amount", "amount_minor must be an integer >= 1");
  }

  dancer.tipsMinor += amount_minor;
  const paymentId = helpers.makeId("tip");
  payments.push({
    id: paymentId,
    type: "tip",
    fan_name: fan_name || "Anonymous",
    dancer_id,
    amount_minor,
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    status: "authorized_offchain",
    created_at: helpers.nowIso()
  });

  res.status(201).json({
    track: "U1",
    payment_id: paymentId,
    amount_minor,
    amount_usd: helpers.toUsd(amount_minor),
    dancer: {
      id: dancer.id,
      name: dancer.name
    },
    gateway: {
      mode: payment_mode || "x402_style_authorization",
      settlement: "batched_on_arc_testnet"
    },
    leaderboard: listLeaderboard()
  });
});

// U2: Pay-per-move tutorials
app.get("/api/tutorials", (_req, res) => {
  res.json({
    track: "U2",
    tutorials: tutorialClips.map((clip) => ({
      ...clip,
      price_usd: helpers.toUsd(clip.priceMinor)
    }))
  });
});

app.get("/api/tutorials/:clipId", (req, res) => {
  const { clipId } = req.params;
  const clip = tutorialClips.find((item) => item.id === clipId);
  if (!clip) {
    return sendError(res, 404, "clip_not_found", "Unknown clip id");
  }

  const unlockToken = req.headers["x-unlock-token"] || req.query.unlock_token;
  const unlockedClips = unlocks.get(String(unlockToken || "")) || new Set();
  if (!unlockToken || !unlockedClips.has(clipId)) {
    return res.status(402).json({
      error: {
        code: "payment_required",
        message: "Tutorial is locked until payment is authorized."
      },
      payment: {
        protocol: "x402",
        amount_minor: clip.priceMinor,
        amount_usd: helpers.toUsd(clip.priceMinor),
        seller: clip.creator
      }
    });
  }

  res.json({
    track: "U2",
    clip: {
      ...clip,
      price_usd: helpers.toUsd(clip.priceMinor)
    },
    content: {
      summary: "Keep core tight, hit chest on beat count 2 and 4, then release with controlled rebound.",
      drills: ["8x slow reps", "8x tempo reps", "freestyle integration 30 sec"]
    }
  });
});

app.post("/api/tutorials/:clipId/pay", (req, res) => {
  const { clipId } = req.params;
  const { buyer_name, payment_mode, payment_ref } = req.body || {};
  const clip = tutorialClips.find((item) => item.id === clipId);
  if (!clip) {
    return sendError(res, 404, "clip_not_found", "Unknown clip id");
  }

  const unlockToken = helpers.makeId("unlock");
  unlocks.set(unlockToken, new Set([clipId]));
  const paymentId = helpers.makeId("clip");
  payments.push({
    id: paymentId,
    type: "tutorial_unlock",
    clip_id: clipId,
    buyer_name: buyer_name || "Anonymous",
    amount_minor: clip.priceMinor,
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    status: "authorized_offchain",
    created_at: helpers.nowIso()
  });

  res.status(201).json({
    track: "U2",
    payment_id: paymentId,
    unlock_token: unlockToken,
    clip_id: clipId,
    amount_minor: clip.priceMinor,
    amount_usd: helpers.toUsd(clip.priceMinor),
    gateway: {
      mode: payment_mode || "x402_authorization",
      settlement: "batched"
    }
  });
});

// U5: Battle entry + prize payout
app.get("/api/battle", (_req, res) => {
  const totalPoolMinor = entries.reduce((sum, entry) => sum + entry.entry_fee_minor, 0);
  res.json({
    track: "U5",
    battle_closed: getBattleClosed(),
    entrants: entries,
    total_pool_minor: totalPoolMinor,
    total_pool_usd: helpers.toUsd(totalPoolMinor),
    payouts
  });
});

app.post("/api/battle/register", (req, res) => {
  if (getBattleClosed()) {
    return sendError(res, 409, "registration_closed", "Battle entry is closed");
  }

  const { dancer_name, wallet, entry_fee_minor, payment_mode, payment_ref } = req.body || {};
  if (!dancer_name || !wallet) {
    return sendError(res, 400, "invalid_entry", "dancer_name and wallet are required");
  }
  if (!Number.isInteger(entry_fee_minor) || entry_fee_minor < 100) {
    return sendError(res, 400, "invalid_fee", "entry_fee_minor must be integer >= 100");
  }

  const entry = {
    id: helpers.makeId("entry"),
    dancer_name,
    wallet,
    entry_fee_minor,
    entry_fee_usd: helpers.toUsd(entry_fee_minor),
    paid_via: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    created_at: helpers.nowIso()
  };

  entries.push(entry);
  res.status(201).json({
    track: "U5",
    entry
  });
});

app.post("/api/battle/close", (_req, res) => {
  setBattleClosed(true);
  res.json({
    track: "U5",
    battle_closed: true,
    message: "Registration locked."
  });
});

app.post("/api/battle/declare-winner", async (req, res) => {
  const { winner_entry_id, execute_via_keeperhub } = req.body || {};
  const winner = entries.find((entry) => entry.id === winner_entry_id);
  if (!winner) {
    return sendError(res, 404, "winner_not_found", "Unknown winner entry id");
  }
  const totalPoolMinor = entries.reduce((sum, entry) => sum + entry.entry_fee_minor, 0);
  const payout = {
    id: helpers.makeId("payout"),
    winner_entry_id,
    winner_name: winner.dancer_name,
    winner_wallet: winner.wallet,
    amount_minor: totalPoolMinor,
    amount_usd: helpers.toUsd(totalPoolMinor),
    chain: "Arc_Testnet",
    settlement_status: "submitted",
    created_at: helpers.nowIso()
  };
  payouts.push(payout);
  const stored = payouts[payouts.length - 1];

  if (execute_via_keeperhub) {
    if (!keeperhub.isConfigured()) {
      stored.keeperhub = {
        ok: false,
        skipped: true,
        message: "Set KEEPERHUB_API_KEY and configure KeeperHub wallet to execute on-chain via KeeperHub."
      };
    } else {
      try {
        const summary = await keeperhub.getStatusSummary(ARCTESTNET_CHAIN_ID);
        if (!summary.execute_network) {
          stored.keeperhub = {
            ok: false,
            error:
              "Arc testnet not found in KeeperHub chain list, or slug unknown. Set KEEPERHUB_EXECUTE_NETWORK (see README)."
          };
          stored.settlement_status = "keeperhub_error";
        } else {
          const transfer = await keeperhub.executeTransferPayout({
            recipientAddress: String(winner.wallet).trim(),
            amountMinor: totalPoolMinor,
            network: summary.execute_network
          });
          stored.keeperhub = { ok: true, transfer, arc: summary };
          stored.settlement_status =
            transfer?.status === "failed" ? "keeperhub_failed" : "keeperhub_submitted";
          if (transfer?.executionId) {
            try {
              stored.keeperhub.execution_status = await keeperhub.getExecutionStatus(transfer.executionId);
            } catch (_e) {
              // non-fatal
            }
          }
        }
      } catch (error) {
        stored.keeperhub = { ok: false, error: error.message, http_status: error.status };
        stored.settlement_status = "keeperhub_error";
      }
    }
  }

  res.status(201).json({
    track: "U5",
    payout: stored
  });
});

// U3: Judge feedback marketplace
app.get("/api/judge-feedback", (_req, res) => {
  return res.json({
    track: "U3",
    requests: feedbackRequests
  });
});

app.post("/api/judge-feedback/requests", (req, res) => {
  const { dancer_name, judge_name, topic, amount_minor, payment_mode, payment_ref } = req.body || {};
  if (!dancer_name || !judge_name || !topic) {
    return sendError(res, 400, "invalid_feedback_request", "dancer_name, judge_name, and topic are required");
  }
  if (!Number.isInteger(amount_minor) || amount_minor < 100) {
    return sendError(res, 400, "invalid_amount", "amount_minor must be an integer >= 100");
  }
  const requestId = helpers.makeId("feedback");
  const record = {
    id: requestId,
    dancer_name,
    judge_name,
    topic,
    amount_minor,
    amount_usd: helpers.toUsd(amount_minor),
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    status: "requested",
    feedback_packet: null,
    created_at: helpers.nowIso(),
    updated_at: helpers.nowIso()
  };
  feedbackRequests.push(record);
  payments.push({
    id: helpers.makeId("feedback-pay"),
    type: "judge_feedback",
    request_id: requestId,
    amount_minor,
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    status: "authorized_offchain",
    created_at: helpers.nowIso()
  });
  return res.status(201).json({ track: "U3", request: record });
});

app.post("/api/judge-feedback/:requestId/deliver", (req, res) => {
  const request = feedbackRequests.find((item) => item.id === req.params.requestId);
  if (!request) {
    return sendError(res, 404, "feedback_request_not_found", "Unknown feedback request id");
  }
  const { strengths, improvements, drill_plan } = req.body || {};
  request.feedback_packet = {
    strengths: strengths || ["Timing and presence are strong."],
    improvements: improvements || ["Work on smoother transitions."],
    drill_plan: drill_plan || ["2x 5-minute isolation drills", "3x battle simulation rounds"]
  };
  request.status = "delivered";
  request.updated_at = helpers.nowIso();
  return res.json({ track: "U3", request });
});

app.post("/api/judge-feedback/:requestId/complete", (req, res) => {
  const request = feedbackRequests.find((item) => item.id === req.params.requestId);
  if (!request) {
    return sendError(res, 404, "feedback_request_not_found", "Unknown feedback request id");
  }
  request.status = "completed";
  request.updated_at = helpers.nowIso();
  return res.json({ track: "U3", request });
});

// U6: Pay-per-session practice room booking
app.get("/api/practice-rooms", (_req, res) => {
  return res.json({
    track: "U6",
    rooms: practiceRooms
  });
});

app.get("/api/practice-bookings", (_req, res) => {
  return res.json({
    track: "U6",
    bookings: practiceBookings
  });
});

app.post("/api/practice-bookings/reserve", (req, res) => {
  const { room_id, dancer_name, planned_minutes, payment_mode, payment_ref } = req.body || {};
  const room = practiceRooms.find((item) => item.id === room_id);
  if (!room) {
    return sendError(res, 404, "room_not_found", "Unknown room id");
  }
  if (!dancer_name || !Number.isInteger(planned_minutes) || planned_minutes < 5) {
    return sendError(res, 400, "invalid_booking", "dancer_name and planned_minutes (>=5) are required");
  }
  const estimateMinor = room.rate_minor_per_min * planned_minutes;
  if (ENABLE_VYPER_SETTLEMENT) {
    const policy = vyperSettlement.evaluate({
      agentId: "payments-agent",
      amountMinor: estimateMinor,
      intent: "practice_booking_reserve"
    });
    if (!policy.approved) {
      return sendError(res, 422, "settlement_policy_blocked", policy.reasons.join(", "));
    }
  }
  const booking = {
    id: helpers.makeId("practice"),
    room_id,
    room_name: room.name,
    dancer_name,
    planned_minutes,
    actual_minutes: null,
    estimated_minor: estimateMinor,
    estimated_usd: helpers.toUsd(estimateMinor),
    final_minor: null,
    final_usd: null,
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    status: "reserved",
    started_at: null,
    ended_at: null,
    created_at: helpers.nowIso()
  };
  practiceBookings.push(booking);
  return res.status(201).json({ track: "U6", booking });
});

app.post("/api/practice-bookings/:bookingId/start", (req, res) => {
  const booking = practiceBookings.find((item) => item.id === req.params.bookingId);
  if (!booking) {
    return sendError(res, 404, "booking_not_found", "Unknown booking id");
  }
  booking.status = "active";
  booking.started_at = helpers.nowIso();
  return res.json({ track: "U6", booking });
});

app.post("/api/practice-bookings/:bookingId/end", (req, res) => {
  const booking = practiceBookings.find((item) => item.id === req.params.bookingId);
  if (!booking) {
    return sendError(res, 404, "booking_not_found", "Unknown booking id");
  }
  const room = practiceRooms.find((item) => item.id === booking.room_id);
  const fallbackMinutes = booking.planned_minutes;
  const actualMinutes = Math.max(1, Number(req.body?.actual_minutes || fallbackMinutes));
  const finalMinor = actualMinutes * (room?.rate_minor_per_min || 0);
  booking.actual_minutes = actualMinutes;
  booking.final_minor = finalMinor;
  booking.final_usd = helpers.toUsd(finalMinor);
  booking.ended_at = helpers.nowIso();
  booking.status = "completed";
  return res.json({ track: "U6", booking });
});

// U7: Krump sample pack licensing
app.get("/api/sample-packs", (_req, res) => {
  return res.json({
    track: "U7",
    packs: samplePacks
  });
});

app.post("/api/sample-packs/:packId/purchase", (req, res) => {
  const pack = samplePacks.find((item) => item.id === req.params.packId);
  if (!pack) {
    return sendError(res, 404, "pack_not_found", "Unknown pack id");
  }
  const { tier_id, buyer_name, payment_mode, payment_ref } = req.body || {};
  const tier = (pack.tiers || []).find((item) => item.id === tier_id);
  if (!tier) {
    return sendError(res, 400, "tier_not_found", "tier_id is required and must match pack tier");
  }
  const license = {
    id: helpers.makeId("license"),
    pack_id: pack.id,
    pack_title: pack.title,
    tier_id: tier.id,
    tier_name: tier.name,
    buyer_name: buyer_name || "Anonymous",
    amount_minor: tier.price_minor,
    amount_usd: helpers.toUsd(tier.price_minor),
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    license_token: helpers.makeId("lictok"),
    created_at: helpers.nowIso()
  };
  issuedLicenses.push(license);
  return res.status(201).json({ track: "U7", license });
});

app.post("/api/sample-packs/licenses/verify", (req, res) => {
  const { license_token } = req.body || {};
  const license = issuedLicenses.find((item) => item.license_token === license_token);
  if (!license) {
    return sendError(res, 404, "license_not_found", "Unknown license token");
  }
  return res.json({ track: "U7", valid: true, license });
});

// U8: Skill challenges with sponsor bounties
app.get("/api/challenges", (_req, res) => {
  return res.json({
    track: "U8",
    challenges,
    submissions: challengeSubmissions,
    payouts: challengePayouts
  });
});

app.post("/api/challenges", (req, res) => {
  const { title, sponsor_name, bounty_minor } = req.body || {};
  if (!title || !sponsor_name || !Number.isInteger(bounty_minor) || bounty_minor < 100) {
    return sendError(res, 400, "invalid_challenge", "title, sponsor_name, bounty_minor>=100 are required");
  }
  const challenge = {
    id: helpers.makeId("challenge"),
    title,
    sponsor_name,
    bounty_minor,
    bounty_usd: helpers.toUsd(bounty_minor),
    status: "open",
    created_at: helpers.nowIso()
  };
  challenges.push(challenge);
  return res.status(201).json({ track: "U8", challenge });
});

app.post("/api/challenges/:challengeId/submit", (req, res) => {
  const challenge = challenges.find((item) => item.id === req.params.challengeId);
  if (!challenge) {
    return sendError(res, 404, "challenge_not_found", "Unknown challenge id");
  }
  const { dancer_name, clip_url } = req.body || {};
  if (!dancer_name || !clip_url) {
    return sendError(res, 400, "invalid_submission", "dancer_name and clip_url are required");
  }
  const submission = {
    id: helpers.makeId("submission"),
    challenge_id: challenge.id,
    dancer_name,
    clip_url,
    score: null,
    status: "submitted",
    created_at: helpers.nowIso()
  };
  challengeSubmissions.push(submission);
  return res.status(201).json({ track: "U8", submission });
});

app.post("/api/challenges/:challengeId/score", (req, res) => {
  const { submission_id, score } = req.body || {};
  const submission = challengeSubmissions.find(
    (item) => item.id === submission_id && item.challenge_id === req.params.challengeId
  );
  if (!submission) {
    return sendError(res, 404, "submission_not_found", "Unknown submission id");
  }
  submission.score = Number(score || 0);
  submission.status = "scored";
  return res.json({ track: "U8", submission });
});

app.post("/api/challenges/:challengeId/payout", (req, res) => {
  const challenge = challenges.find((item) => item.id === req.params.challengeId);
  if (!challenge) {
    return sendError(res, 404, "challenge_not_found", "Unknown challenge id");
  }
  const { winner_submission_id, payment_mode, payment_ref } = req.body || {};
  const winner = challengeSubmissions.find(
    (item) => item.id === winner_submission_id && item.challenge_id === challenge.id
  );
  if (!winner) {
    return sendError(res, 404, "winner_submission_not_found", "Unknown winner submission id");
  }
  challenge.status = "paid_out";
  const payout = {
    id: helpers.makeId("challenge-payout"),
    challenge_id: challenge.id,
    winner_submission_id: winner.id,
    winner_name: winner.dancer_name,
    amount_minor: challenge.bounty_minor,
    amount_usd: helpers.toUsd(challenge.bounty_minor),
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    created_at: helpers.nowIso()
  };
  challengePayouts.push(payout);
  return res.status(201).json({ track: "U8", payout });
});

// U4: Crew revenue split wallet
app.get("/api/crews", (_req, res) => {
  return res.json({
    track: "U4",
    crews,
    settlements: crewSettlements
  });
});

app.post("/api/crews", (req, res) => {
  const { name, members } = req.body || {};
  if (!name || !Array.isArray(members) || members.length < 1) {
    return sendError(res, 400, "invalid_crew", "name and members[] are required");
  }
  const totalShare = members.reduce((sum, member) => sum + Number(member.share_bps || 0), 0);
  if (totalShare !== 10000) {
    return sendError(res, 400, "invalid_split", "members share_bps must sum to 10000");
  }
  const crew = {
    id: helpers.makeId("crew"),
    name,
    members: members.map((member) => ({
      name: member.name,
      wallet: member.wallet || null,
      share_bps: Number(member.share_bps)
    })),
    created_at: helpers.nowIso()
  };
  crews.push(crew);
  return res.status(201).json({ track: "U4", crew });
});

app.post("/api/crews/:crewId/split-settlement", (req, res) => {
  const crew = crews.find((item) => item.id === req.params.crewId);
  if (!crew) {
    return sendError(res, 404, "crew_not_found", "Unknown crew id");
  }
  const { amount_minor, payment_ref, source } = req.body || {};
  if (!Number.isInteger(amount_minor) || amount_minor < 1) {
    return sendError(res, 400, "invalid_amount", "amount_minor must be an integer >= 1");
  }
  const shares = crew.members.map((member, idx) => {
    const raw = Math.floor((amount_minor * member.share_bps) / 10000);
    const isLast = idx === crew.members.length - 1;
    return {
      member_name: member.name,
      wallet: member.wallet,
      share_bps: member.share_bps,
      amount_minor: isLast
        ? amount_minor - crew.members.slice(0, idx).reduce((sum, m) => sum + Math.floor((amount_minor * m.share_bps) / 10000), 0)
        : raw
    };
  });
  const settlement = {
    id: helpers.makeId("split"),
    crew_id: crew.id,
    source: source || "manual",
    payment_ref: payment_ref || null,
    amount_minor,
    amount_usd: helpers.toUsd(amount_minor),
    shares: shares.map((share) => ({ ...share, amount_usd: helpers.toUsd(share.amount_minor) })),
    created_at: helpers.nowIso()
  };
  crewSettlements.push(settlement);
  return res.status(201).json({ track: "U4", settlement });
});

// U10: Agent-based merch concierge
app.get("/api/merch/catalog", (_req, res) => {
  return res.json({
    track: "U10",
    items: merchCatalog.map((item) => ({ ...item, price_usd: helpers.toUsd(item.price_minor) }))
  });
});

app.post("/api/merch/concierge/recommend", (req, res) => {
  const { style, budget_minor } = req.body || {};
  const budget = Number(budget_minor || 0);
  const filtered = merchCatalog.filter((item) => (budget > 0 ? item.price_minor <= budget : true));
  const picks = filtered.slice(0, 2);
  return res.json({
    track: "U10",
    style: style || "all",
    picks: picks.map((item) => ({
      ...item,
      price_usd: helpers.toUsd(item.price_minor),
      rationale: "Matches budget and battle utility."
    }))
  });
});

app.post("/api/merch/checkout", (req, res) => {
  const { item_id, quantity, buyer_name, payment_mode, payment_ref } = req.body || {};
  const item = merchCatalog.find((row) => row.id === item_id);
  if (!item) {
    return sendError(res, 404, "merch_item_not_found", "Unknown merch item id");
  }
  const qty = Math.max(1, Number(quantity || 1));
  const amountMinor = item.price_minor * qty;
  const order = {
    id: helpers.makeId("merch"),
    item_id: item.id,
    item_name: item.name,
    quantity: qty,
    buyer_name: buyer_name || "Anonymous",
    amount_minor: amountMinor,
    amount_usd: helpers.toUsd(amountMinor),
    payment_mode: payment_mode || "offchain_demo",
    payment_ref: payment_ref || null,
    status: "authorized_offchain",
    created_at: helpers.nowIso()
  };
  merchOrders.push(order);
  return res.status(201).json({ track: "U10", order });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "krump-ucp-mvp" });
});

app.listen(PORT, () => {
  console.log(`Krump MVP server running on http://localhost:${PORT}`);
});
