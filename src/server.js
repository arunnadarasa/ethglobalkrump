require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const path = require("path");
const {
  dancers,
  tutorialClips,
  entries,
  payments,
  payouts,
  unlocks,
  battleClosed,
  helpers
} = require("./state");

const app = express();
const PORT = process.env.PORT || 3000;
const CIRCLE_API_BASE = process.env.CIRCLE_API_BASE || "https://api.circle.com";
const CIRCLE_TRANSFER_PATH = process.env.CIRCLE_TRANSFER_PATH || "/v1/w3s/developer/transactions/transfer";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || "";
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || "";
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
let activeCircleWalletId = CIRCLE_WALLET_ID;
let activeCircleWalletSetId = CIRCLE_WALLET_SET_ID;

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
      }
    }
  };
}

function makeUuid() {
  return crypto.randomUUID();
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

async function ensureCircleWalletSet(walletSetName) {
  if (activeCircleWalletSetId) {
    return activeCircleWalletSetId;
  }
  const payload = {
    idempotencyKey: makeUuid(),
    entitySecretCiphertext: CIRCLE_ENTITY_SECRET,
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

async function createCircleWallet({ blockchain, walletSetId, walletName }) {
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    throw new Error("Circle credentials missing: set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET");
  }
  const resolvedWalletSetId = walletSetId || (await ensureCircleWalletSet("krump-wallet-set"));
  const payload = {
    idempotencyKey: makeUuid(),
    entitySecretCiphertext: CIRCLE_ENTITY_SECRET,
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

async function createCircleTransfer({ amountMinor, memo }) {
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET || !activeCircleWalletId) {
    throw new Error("Circle credentials missing: set CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_ID");
  }
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
    walletId: activeCircleWalletId,
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
    const detail = body?.message || body?.error || `Circle API ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return {
    request: payload,
    response: body
  };
}

app.get("/api/config", (_req, res) => {
  res.json(getRailConfig());
});

app.post("/api/circle/wallets/create", async (req, res) => {
  try {
    const { blockchain, wallet_set_id, wallet_name } = req.body || {};
    const created = await createCircleWallet({
      blockchain: blockchain || "ARC-TESTNET",
      walletSetId: wallet_set_id || "",
      walletName: wallet_name || ""
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

app.post("/api/payments/circle/transfer", async (req, res) => {
  try {
    const { amount_minor, memo } = req.body || {};
    if (!Number.isInteger(amount_minor) || amount_minor < 1) {
      return sendError(res, 400, "invalid_amount", "amount_minor must be an integer >= 1");
    }
    const transfer = await createCircleTransfer({ amountMinor: amount_minor, memo });
    return res.status(201).json({
      payment_mode: "circle_wallet",
      amount_minor,
      amount_usd: helpers.toUsd(amount_minor),
      transfer
    });
  } catch (error) {
    return sendError(res, 502, "circle_transfer_failed", error.message);
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

app.post("/api/battle/declare-winner", (req, res) => {
  const { winner_entry_id } = req.body || {};
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

  res.status(201).json({
    track: "U5",
    payout
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "krump-ucp-mvp" });
});

app.listen(PORT, () => {
  console.log(`Krump MVP server running on http://localhost:${PORT}`);
});
