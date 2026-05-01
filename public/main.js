async function request(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { ok: response.ok, status: response.status, body };
}

function print(targetId, payload) {
  document.getElementById(targetId).textContent = JSON.stringify(payload, null, 2);
}

function normalizeEnsNameInput(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }
  if (value.includes(".")) {
    return value;
  }
  const normalized = `${value}.eth`;
  debugEnsLog("H10", "public/main.js:normalizeEnsNameInput", "auto-appended .eth to ENS name", {
    inputLength: value.length,
    outputLength: normalized.length
  });
  return normalized;
}

function deriveAgentIdFromEnsName(ensNameRaw) {
  const normalizedEns = normalizeEnsNameInput(ensNameRaw);
  const label = String(normalizedEns || "").split(".")[0] || "";
  const safe = label
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!safe) {
    return "";
  }
  return `agent.${safe}`;
}

function judgeLabelFromEns(ensFull) {
  const n = normalizeEnsNameInput(ensFull);
  return n || "Judge";
}

function debugEnsLog() {}

let unlockToken = "";
let railConfig = null;
let connectedAccount = "";
let lastCreatedCircleWallet = null;
let lastAgentSessionId = "";
let lastEnsJudgeResolve = null;
let lastU8ChallengeId = "";
let lastU8SubmissionId = "";
let ensSubmissionTimerHandle = null;
let ensSubmissionStartedAtMs = 0;
let lastAutoAgentId = "";

const ETHGLOBAL_HACK_WINNER_LABEL = "ETHGlobal Demo — Winner";
const ETHGLOBAL_HACK_CHALLENGER_LABEL = "ETHGlobal Demo — Challenger";
/** Cheap demo rail: 10 minor units = $0.10 (see helpers.toUsd in server). */
const DEMO_USDC_MINOR = 10;
/** Keep in sync with `listCapabilities().intents` in `src/agents/orchestrator.js`. */
const ALL_ORCHESTRATOR_INTENTS_CSV =
  "tip_dancer,unlock_clip,battle_entry,judge_feedback_request,crew_split_settlement,practice_room_reserve,sample_pack_purchase,challenge_payout,merch_concierge_checkout";
const ETHGLOBAL_CHALLENGE_AMOUNT_MINOR = DEMO_USDC_MINOR;

const AISA_LLM_MODEL_CATALOG = [
  { id: "claude-3-7-sonnet-20250219", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "claude-3-7-sonnet-20250219-thinking", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "claude-opus-4-1-20250805", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-opus-4-1-20250805-thinking", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-opus-4-20250514", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-opus-4-20250514-thinking", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-opus-4-5-20251101", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-opus-4-6", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-opus-4-7", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-sonnet-4-20250514", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-sonnet-4-20250514-thinking", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-sonnet-4-5-20250929", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-sonnet-4-6", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "claude-sonnet-4-6-thinking", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "deepseek-v3.2", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "gemini-2.5-flash", endpoint: "/v1/chat/completions", capabilities: ["text", "audio", "vision"] },
  { id: "gemini-2.5-flash-lite", endpoint: "/v1/chat/completions", capabilities: ["text", "audio", "vision"] },
  { id: "gemini-2.5-pro", endpoint: "/v1/chat/completions", capabilities: ["text", "audio", "coding", "vision"] },
  { id: "gemini-3-pro-image-preview", endpoint: "/v1/chat/completions", capabilities: ["image", "vision"] },
  { id: "gemini-3-pro-preview", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "gemini-3.1-pro-preview", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "glm-5", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "gpt-4.1", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "gpt-4.1-mini", endpoint: "/v1/chat/completions", capabilities: ["text", "coding", "vision"] },
  { id: "gpt-4o", endpoint: "/v1/chat/completions", capabilities: ["text", "audio", "vision"] },
  { id: "gpt-4o-mini", endpoint: "/v1/chat/completions", capabilities: ["text", "audio", "vision"] },
  { id: "gpt-5", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "gpt-5-mini", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "gpt-5.2", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "gpt-5.2-chat-latest", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "gpt-5.3-codex", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "gpt-5.4", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "kimi-k2-thinking", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "kimi-k2.5", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "MiniMax-M2.5", endpoint: "/v1/chat/completions", capabilities: ["text", "audio", "vision"] },
  { id: "qwen-flash", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "qwen-mt-flash", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "qwen-mt-lite", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "qwen-plus-2025-12-01", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "qwen3-coder-plus", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "qwen3-max", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "qwen3-vl-flash", endpoint: "/v1/chat/completions", capabilities: ["vision", "text"] },
  { id: "qwen3-vl-flash-2025-10-15", endpoint: "/v1/chat/completions", capabilities: ["vision", "text"] },
  { id: "qwen3-vl-plus", endpoint: "/v1/chat/completions", capabilities: ["vision", "text"] },
  { id: "qwen3.6-plus", endpoint: "/v1/chat/completions", capabilities: ["text", "coding"] },
  { id: "seed-1-6-250915", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "seed-1-6-flash-250715", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "seed-1-8-251228", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "seed-2-0-lite-260228", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "seed-2-0-mini-260215", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "seed-2-0-pro-260328", endpoint: "/v1/chat/completions", capabilities: ["text"] },
  { id: "seedream-4-5-251128", endpoint: "/v1/chat/completions", capabilities: ["image"] },
  { id: "wan2.7-image", endpoint: "/v1/chat/completions", capabilities: ["image"] },
  { id: "wan2.7-image-pro", endpoint: "/v1/chat/completions", capabilities: ["image"] }
];

function extractCircleWalletDetails(payload) {
  const wallet =
    payload?.wallet ||
    payload?.data?.wallet ||
    payload?.wallets?.[0] ||
    payload?.data?.wallets?.[0] ||
    payload?.result?.wallet ||
    payload?.result?.wallets?.[0] ||
    null;
  const walletId = wallet?.id || payload?.walletId || payload?.wallet_id || null;
  const walletAddress = wallet?.address || payload?.address || payload?.wallet_address || null;
  const walletSetId = payload?.walletSetId || payload?.wallet_set_id || wallet?.walletSetId || null;
  if (!walletId || !walletAddress) {
    return null;
  }
  return { walletId, walletAddress, walletSetId };
}

function setCircleSaveStatus(message) {
  document.getElementById("circle-wallet-save-status").textContent = message;
}

function renderCircleFundingCue(details) {
  const target = document.getElementById("circle-funding-cue");
  if (!details) {
    target.textContent = "Create a Circle wallet, then save it to show funding instructions.";
    return;
  }
  const faucetUrl = "https://faucet.circle.com/";
  target.innerHTML =
    `Wallet ID: <code>${details.walletId}</code><br>` +
    `Wallet Address: <code>${details.walletAddress}</code><br>` +
    `Fund this wallet on Arc Testnet using Circle Faucet: <a href="${faucetUrl}" target="_blank" rel="noopener noreferrer">${faucetUrl}</a>`;
}

function getWalletDetailsFromOutputPane() {
  try {
    const raw = document.getElementById("circle-wallet-output").textContent || "";
    if (!raw.trim()) {
      return null;
    }
    return extractCircleWalletDetails(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
}

function toHexWeiFromMinor(minor) {
  const wei = BigInt(minor) * 10n ** 14n;
  return `0x${wei.toString(16)}`;
}

function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

function formatEthFromWeiString(weiText) {
  try {
    const value = BigInt(String(weiText || "0"));
    const base = 10n ** 18n;
    const whole = value / base;
    const frac = value % base;
    if (frac === 0n) {
      return `${whole.toString()}.0`;
    }
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fracStr}`;
  } catch (_error) {
    return null;
  }
}

async function getNativeBalanceFromMetaMask() {
  await connectMetaMask();
  const hexBalance = await window.ethereum.request({
    method: "eth_getBalance",
    params: [connectedAccount, "latest"]
  });
  const wei = BigInt(hexBalance);
  return {
    account: connectedAccount,
    amount: formatUnits(wei, 18),
    symbol: railConfig?.rails?.metamask?.symbol || "NATIVE",
    source: "eth_getBalance"
  };
}

function erc20BalanceOfCallData(address) {
  return `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

async function getErc20BalanceFromMetaMask(tokenAddress) {
  if (!tokenAddress || !window.ethereum) {
    return null;
  }
  await connectMetaMask();
  let callResult = "0x0";
  try {
    callResult = await window.ethereum.request({
      method: "eth_call",
      params: [
        {
          to: tokenAddress,
          data: erc20BalanceOfCallData(connectedAccount)
        },
        "latest"
      ]
    });
  } catch (error) {
    throw error;
  }
  const rawBalance = BigInt(callResult || "0x0");
  // Try decimals(), fallback to 6 for USDC-like tokens on testnets.
  let decimals = 6;
  try {
    const decimalsResult = await window.ethereum.request({
      method: "eth_call",
      params: [
        {
          to: tokenAddress,
          data: "0x313ce567"
        },
        "latest"
      ]
    });
    decimals = Number(BigInt(decimalsResult || "0x6"));
  } catch (_error) {
    decimals = 6;
  }
  return {
    account: connectedAccount,
    token_address: tokenAddress,
    amount: formatUnits(rawBalance, decimals),
    decimals,
    symbol: "USDC",
    source: "eth_call.balanceOf"
  };
}

async function getCircleWalletBalance() {
  const walletId =
    railConfig?.rails?.circle?.wallet_id || lastCreatedCircleWallet?.walletId || null;
  if (!walletId) {
    throw new Error("No Circle wallet id available. Create/save a Circle wallet first.");
  }
  const response = await request(`/api/circle/wallets/${walletId}/balances`);
  if (!response.ok) {
    throw new Error(response.body?.error?.message || "Failed to fetch Circle wallet balance");
  }
  return response.body;
}

async function refreshBalances() {
  try {
    const native = await getNativeBalanceFromMetaMask();
    const tokenAddress = railConfig?.rails?.circle?.token_address || "";
    const usdcToken = await getErc20BalanceFromMetaMask(tokenAddress);
    const circle = await getCircleWalletBalance();
    print("balances-output", {
      metamask: {
        native_balance: native,
        usdc_token_balance: usdcToken
      },
      circle_wallet: circle
    });
  } catch (error) {
    print("balances-output", { error: error.message });
  }
}

async function loadUcpDiscoveryFromUi() {
  const response = await request("/api/ucp/discovery");
  print("ucp-output", {
    route: "/api/ucp/discovery",
    ok: response.ok,
    status: response.status,
    body: response.body
  });
}

async function runUcpSelfTestFromUi() {
  const response = await request("/api/ucp/conformance/self-test");
  print("ucp-output", {
    route: "/api/ucp/conformance/self-test",
    ok: response.ok,
    status: response.status,
    body: response.body
  });
}

async function runUcpSampleCheckoutFromUi() {
  const payload = {
    currency: "USD",
    line_items: [{ item: { id: "clip-1" }, quantity: 1 }],
    payment: {
      instruments: [{ id: "card-1", handler_id: "stripe", type: "card", brand: "visa", last_digits: "4242" }],
      selected_instrument_id: "card-1"
    }
  };
  const response = await request("/api/ucp/checkout/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  print("ucp-output", {
    route: "/api/ucp/checkout/create",
    ok: response.ok,
    status: response.status,
    request: payload,
    body: response.body
  });
}

function parseAgentContext() {
  const raw = document.getElementById("agent-context-json").value || "";
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error("Invalid JSON in agent context field.");
  }
}

function getExecutionSelection(modeElementId, networkElementId) {
  return {
    execution_mode: document.getElementById(modeElementId)?.value || "online",
    execution_network: document.getElementById(networkElementId)?.value || "base-sepolia"
  };
}

function applyDefaultExecutionMode() {
  document.querySelectorAll('select[id$="execution-mode"]').forEach((select) => {
    if (select.id === "ethglobal-demo-execution-mode") {
      return;
    }
    if (Array.from(select.options).some((option) => option.value === "online")) {
      select.value = "online";
    }
  });
}

function applyEthglobalHackathonExecutionModeUi() {
  const modeSel = document.getElementById("ethglobal-demo-execution-mode");
  const netSel = document.getElementById("ethglobal-demo-execution-network");
  if (!modeSel || !netSel) return;
  const mode = modeSel.value;
  const arcOpt = Array.from(netSel.options).find((o) => o.value === "arc-testnet");
  if (mode === "local") {
    if (arcOpt) arcOpt.hidden = false;
    if (arcOpt) netSel.value = "arc-testnet";
    netSel.disabled = true;
    netSel.title = "Execution local stays on Arc Testnet (KeeperHub slug arc-testnet; no bridge destination).";
  } else {
    if (netSel.value === "arc-testnet") {
      netSel.value = "base-sepolia";
    }
    if (arcOpt) arcOpt.hidden = true;
    netSel.disabled = false;
    netSel.title = "";
  }
}

async function loadAgentCapabilitiesFromUi() {
  const response = await request("/api/agents/capabilities");
  const intents = response.body?.agents?.intents || [];
  if (Array.isArray(intents) && intents.length > 0) {
    const select = document.getElementById("agent-intent");
    const currentValue = select.value;
    select.innerHTML = "";
    intents.forEach((intent) => {
      const option = document.createElement("option");
      option.value = intent.id;
      option.textContent = intent.id;
      select.appendChild(option);
    });
    if (Array.from(select.options).some((opt) => opt.value === currentValue)) {
      select.value = currentValue;
    }
  }
  print("agent-output", {
    route: "/api/agents/capabilities",
    ok: response.ok,
    status: response.status,
    body: response.body
  });
}

async function loadAgentIdentityFromUi() {
  const response = await request("/api/agents/identity");
  print("agent-output", {
    route: "/api/agents/identity",
    ok: response.ok,
    status: response.status,
    body: response.body
  });
}

async function runAgentSessionFromUi() {
  const intent = document.getElementById("agent-intent").value;
  const paymentMode = document.getElementById("agent-payment-mode").value || "offchain_demo";
  const execution = getExecutionSelection("agent-execution-mode", "agent-execution-network");
  const parsedContext = parseAgentContext();
  const fallbackAmounts = Object.fromEntries(
    ALL_ORCHESTRATOR_INTENTS_CSV.split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => [id, DEMO_USDC_MINOR])
  );
  const amountMinor = Number(parsedContext.amount_minor || fallbackAmounts[intent] || DEMO_USDC_MINOR);
  const payment = await resolvePaymentReference(paymentMode, amountMinor, `agent-${intent}`, intent);
  const ensName = document.getElementById("agent-ens-name")?.value?.trim() || "";
  const context = {
    ...parsedContext,
    amount_minor: amountMinor,
    payment_mode: payment.mode,
    payment_ref: payment.ref,
    execution_mode: execution.execution_mode,
    execution_network: execution.execution_network
  };
  if (ensName) {
    context.agent_ens_name = ensName;
  }
  const payload = { intent, context };
  const response = await request("/api/agents/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  lastAgentSessionId = response.body?.session?.id || "";
  print("agent-output", {
    route: "/api/agents/sessions",
    ok: response.ok,
    status: response.status,
    request: payload,
    payment_receipt: payment.receipt,
    body: response.body
  });
}

function setEnsJudgeChip({ statusId, chipText, variant }) {
  const target = document.getElementById(statusId);
  if (!target) {
    return;
  }
  if (!chipText) {
    target.classList.add("hidden");
    return;
  }
  target.classList.remove("hidden");
  target.classList.remove("warning", "success");
  if (variant === "success") {
    target.classList.add("success");
  } else if (variant === "warning") {
    target.classList.add("warning");
  }
  target.textContent = chipText;
}

function setEnsStepStatus(stepId, status) {
  const node = document.getElementById(stepId);
  if (!node) {
    return;
  }
  node.classList.remove("hidden", "active", "done", "failed");
  if (!status) {
    node.classList.add("hidden");
    return;
  }
  if (status === "active") {
    node.classList.add("active");
    return;
  }
  if (status === "done") {
    node.classList.add("done");
    return;
  }
  if (status === "failed") {
    node.classList.add("failed");
  }
}

function setEnsTrustBadge({ badgeId, label, value }) {
  const node = document.getElementById(badgeId);
  if (!node) {
    return;
  }
  node.classList.remove("hidden", "success", "warning");
  node.textContent = `${label}: ${value ? "true" : "false"}`;
  node.classList.add(value ? "success" : "warning");
}

function renderEnsTrustBadges(trust) {
  const normalized = trust || {};
  setEnsTrustBadge({
    badgeId: "ens-badge-spec",
    label: "Spec",
    value: Boolean(normalized.ensip25_spec_verified)
  });
  setEnsTrustBadge({
    badgeId: "ens-badge-registry",
    label: "Registry",
    value: Boolean(normalized.registry_side_verified)
  });
  setEnsTrustBadge({
    badgeId: "ens-badge-bidirectional",
    label: "Bidirectional",
    value: Boolean(normalized.ensip25_bidirectional_verified)
  });
}

function stopEnsSubmissionTimer() {
  if (ensSubmissionTimerHandle) {
    cancelAnimationFrame(ensSubmissionTimerHandle);
    ensSubmissionTimerHandle = null;
  }
  ensSubmissionStartedAtMs = 0;
  debugEnsLog("H11", "public/main.js:stopEnsSubmissionTimer", "stopped ENS submission timer", {});
}

function maybeAutoFillAgentIdFromEnsName() {
  const ensNameRaw = document.getElementById("ens-name-input")?.value || document.getElementById("agent-ens-name")?.value || "";
  const nextAuto = deriveAgentIdFromEnsName(ensNameRaw);
  if (!nextAuto) {
    return;
  }
  const input = document.getElementById("ens-agent-id");
  if (!input) {
    return;
  }
  const current = String(input.value || "").trim();
  const canOverwrite = !current || current === lastAutoAgentId;
  if (!canOverwrite) {
    debugEnsLog("H12", "public/main.js:maybeAutoFillAgentIdFromEnsName", "skip auto-fill due manual agentId", {
      currentLength: current.length,
      lastAutoLength: lastAutoAgentId.length
    });
    return;
  }
  const prevAuto = lastAutoAgentId;
  input.value = nextAuto;
  lastAutoAgentId = nextAuto;
  const ensip25AgentIdInput = document.getElementById("ensip25-agent-id");
  if (ensip25AgentIdInput) {
    const currentEnsip25 = String(ensip25AgentIdInput.value || "").trim();
    if (!currentEnsip25 || currentEnsip25 === prevAuto) {
      ensip25AgentIdInput.value = nextAuto;
    }
  }
  debugEnsLog("H12", "public/main.js:maybeAutoFillAgentIdFromEnsName", "auto-filled agentId", {
    agentIdLength: nextAuto.length
  });
}

function startEnsSubmissionTimer() {
  stopEnsSubmissionTimer();
  ensSubmissionStartedAtMs = Date.now();
  debugEnsLog("H11", "public/main.js:startEnsSubmissionTimer", "started ENS submission timer", {});
  const render = () => {
    if (!ensSubmissionStartedAtMs) {
      return;
    }
    const elapsedSec = Math.floor((Date.now() - ensSubmissionStartedAtMs) / 1000);
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: `Submitting ENS setup transaction... ${elapsedSec}s elapsed. If name is unowned, commit->register can take ~60-90s.`,
      variant: "warning"
    });
    ensSubmissionTimerHandle = requestAnimationFrame(render);
  };
  ensSubmissionTimerHandle = requestAnimationFrame(render);
}

function updateAgentRunDisabledByEnsGating() {
  const runBtn = document.getElementById("agent-run-session");
  if (!runBtn) {
    return;
  }
  if (!lastEnsJudgeResolve) {
    runBtn.disabled = false;
    return;
  }
  const selectedIntent = document.getElementById("agent-intent")?.value || "";
  if (!selectedIntent) {
    // If no intent is selected, don't block the session button.
    runBtn.disabled = false;
    return;
  }
  const allowedIntents = Array.isArray(lastEnsJudgeResolve.allowed_intents) ? lastEnsJudgeResolve.allowed_intents : [];
  const hasAllowedIntents = allowedIntents.length > 0;
  const isAllowedIntent = hasAllowedIntents ? allowedIntents.includes(selectedIntent) : true;
  const isTrusted = lastEnsJudgeResolve?.trust?.is_trusted_for_intent !== false;
  const isCompatible = lastEnsJudgeResolve?.versioning?.is_compatible_for_intent !== false;
  runBtn.disabled = !(isAllowedIntent && isTrusted && isCompatible);
}

function renderEnsWorkshopChips(payload, selectedIntent) {
  const trust = payload?.trust || {};
  const privacy = payload?.privacy || {};
  const versioning = payload?.versioning || {};
  const ensip25Key = trust.ensip25_key || "unset";
  const trustText = trust.is_high_risk_intent
    ? `Trust gate: ${trust.is_trusted_for_intent ? "allow" : "block"} for high-risk "${selectedIntent}". ENSIP-25 verified=${trust.ensip25_verified}; key=${ensip25Key}`
    : `Trust gate: low-risk path for "${selectedIntent || "none"}". ENSIP-25 verified=${trust.ensip25_verified}; key=${ensip25Key}`;
  setEnsJudgeChip({
    statusId: "ens-trust-chip",
    chipText: trustText,
    variant: trust.is_trusted_for_intent === false ? "warning" : "success"
  });
  renderEnsTrustBadges(trust);

  const privacyMode = privacy.payout_mode || "public";
  const privacyReceiver = privacy.privacy_receiver || "(none)";
  setEnsJudgeChip({
    statusId: "ens-privacy-chip",
    chipText: `Privacy payout: mode=${privacyMode}; receiver=${privacyReceiver}`,
    variant: privacyMode === "privacy" && !privacy.privacy_receiver ? "warning" : "success"
  });

  const versionText = `Versioning: agent=${versioning.agent_version || "unset"}; capabilities=${versioning.capabilities_version || "unset"}; compatible=${versioning.is_compatible_for_intent === false ? "no" : "yes"}`;
  setEnsJudgeChip({
    statusId: "ens-versioning-chip",
    chipText: versionText,
    variant: versioning.is_compatible_for_intent === false ? "warning" : "success"
  });
}

async function resolveEnsJudgeIdentityForUi() {
  const judgeEnsInputEl = document.getElementById("ens-name-input");
  const globalEnsInputEl = document.getElementById("agent-ens-name");
  const ensNameRaw = judgeEnsInputEl?.value || globalEnsInputEl?.value || "";
  const ensName = normalizeEnsNameInput(ensNameRaw);
  if (judgeEnsInputEl && !judgeEnsInputEl.value && ensName) {
    judgeEnsInputEl.value = ensName;
  }
  if (judgeEnsInputEl && judgeEnsInputEl.value !== ensName) {
    judgeEnsInputEl.value = ensName;
  }
  if (globalEnsInputEl && !globalEnsInputEl.value && ensName) {
    globalEnsInputEl.value = ensName;
  }
  if (globalEnsInputEl && globalEnsInputEl.value !== ensName) {
    globalEnsInputEl.value = ensName;
  }
  debugEnsLog("H1", "public/main.js:resolveEnsJudgeIdentityForUi", "resolve clicked with ENS input state", {
    hasJudgeEnsInputElement: Boolean(judgeEnsInputEl),
    hasGlobalEnsInputElement: Boolean(globalEnsInputEl),
    ensNameLength: ensName.length
  });
  if (!ensName) {
    debugEnsLog("H2", "public/main.js:resolveEnsJudgeIdentityForUi", "resolve blocked due empty ENS name", {
      ensNameLength: ensName.length
    });
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Set Agent ENS name (top of Agent Orchestration) first.",
      variant: "warning"
    });
    return { ok: false, reason: "missing_ens_name" };
  }
  const selectedIntent = document.getElementById("agent-intent")?.value || "";
  const registry = document.getElementById("ensip25-registry")?.value?.trim() || "";
  const ensip25AgentId = document.getElementById("ensip25-agent-id")?.value?.trim() || document.getElementById("ens-agent-id")?.value?.trim() || "";
  const url = `/api/ens/resolve?name=${encodeURIComponent(ensName)}&intent=${encodeURIComponent(selectedIntent)}&registry=${encodeURIComponent(registry)}&agentId=${encodeURIComponent(ensip25AgentId)}`;

  const data = await request(url, { method: "GET" });
  if (!data.ok) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: data.body?.error?.message || "ENS resolve failed.",
      variant: "warning"
    });
    return { ok: false, status: data.status, body: data.body };
  }

  lastEnsJudgeResolve = data.body || null;
  const agentActorAddress = lastEnsJudgeResolve?.agent_actor_address || "";
  const resolvedAgentId = lastEnsJudgeResolve?.text?.agentId || "";
  const allowedIntents = lastEnsJudgeResolve?.allowed_intents || [];
  const allowedIntentsLabel = allowedIntents.length ? allowedIntents.join(", ") : "(none set)";

  setEnsJudgeChip({
    statusId: "ens-identity-status",
    chipText: `Resolved agentId (Vyper agentId): ${resolvedAgentId || "none"} | actor addr: ${agentActorAddress || "none"} | ENS allowedIntents: ${allowedIntentsLabel}`,
    variant: "success"
  });

  const isAllowed = lastEnsJudgeResolve?.is_allowed_for_intent;
  if (isAllowed === true) {
    setEnsJudgeChip({ statusId: "ens-gating-chip", chipText: `Selected intent "${selectedIntent}" allowed by ENS.`, variant: "success" });
  } else if (isAllowed === false) {
    setEnsJudgeChip({ statusId: "ens-gating-chip", chipText: `Selected intent "${selectedIntent}" blocked by ENS allowedIntents.`, variant: "warning" });
  } else {
    setEnsJudgeChip({ statusId: "ens-gating-chip", chipText: "", variant: null });
  }
  renderEnsWorkshopChips(lastEnsJudgeResolve, selectedIntent);

  const output = {
    route: url,
    body: lastEnsJudgeResolve
  };
  print("ens-identity-output", output);

  updateAgentRunDisabledByEnsGating();
  return { ok: true, status: data.status, body: data.body };
}

async function registerUpdateEnsJudgeIdentityForUi() {
  const judgeEnsInputEl = document.getElementById("ens-name-input");
  const globalEnsInputEl = document.getElementById("agent-ens-name");
  const ensNameRaw = judgeEnsInputEl?.value || globalEnsInputEl?.value || "";
  const ensName = normalizeEnsNameInput(ensNameRaw);
  if (judgeEnsInputEl && !judgeEnsInputEl.value && ensName) {
    judgeEnsInputEl.value = ensName;
  }
  if (judgeEnsInputEl && judgeEnsInputEl.value !== ensName) {
    judgeEnsInputEl.value = ensName;
  }
  if (globalEnsInputEl && !globalEnsInputEl.value && ensName) {
    globalEnsInputEl.value = ensName;
  }
  if (globalEnsInputEl && globalEnsInputEl.value !== ensName) {
    globalEnsInputEl.value = ensName;
  }
  const arcActorAddress = document.getElementById("ens-arc-actor-address")?.value?.trim() || "";
  const agentId = document.getElementById("ens-agent-id")?.value?.trim() || "";
  const tokenUri = document.getElementById("ens-token-uri")?.value?.trim() || "";
  const capabilitiesUri = document.getElementById("ens-capabilities-uri")?.value?.trim() || "";
  const ensip25Registry = document.getElementById("ensip25-registry")?.value?.trim() || "";
  const ensip25AgentId = document.getElementById("ensip25-agent-id")?.value?.trim() || agentId;
  const ensip25Value = document.getElementById("ensip25-value")?.value?.trim() || "1";
  const attestor = document.getElementById("ens-attestor")?.value?.trim() || "";
  const highRiskIntents = document.getElementById("ens-high-risk-intents")?.value?.trim() || "";
  const payoutMode = document.getElementById("ens-payout-mode")?.value || "public";
  const privacyReceiver = document.getElementById("ens-privacy-receiver")?.value?.trim() || "";
  const agentVersion = document.getElementById("ens-agent-version")?.value?.trim() || "";
  const capabilitiesVersion = document.getElementById("ens-capabilities-version")?.value?.trim() || "";
  const compatibleIntents = document.getElementById("ens-compatible-intents")?.value?.trim() || "";
  const selectedIntent = document.getElementById("agent-intent")?.value || "";
  const allowedIntentsCsv = document.getElementById("ens-allowed-intents-csv")?.value?.trim() || "";
  const writeMode = document.getElementById("ens-write-mode")?.value || "demo";
  debugEnsLog("H3", "public/main.js:registerUpdateEnsJudgeIdentityForUi", "register clicked with form state", {
    hasJudgeEnsInputElement: Boolean(judgeEnsInputEl),
    hasGlobalEnsInputElement: Boolean(globalEnsInputEl),
    ensNameLength: ensName.length,
    arcActorAddressLength: arcActorAddress.length,
    agentIdLength: agentId.length,
    selectedIntent,
    writeMode
  });

  if (!ensName) {
    debugEnsLog("H4", "public/main.js:registerUpdateEnsJudgeIdentityForUi", "register blocked due empty ENS name", {
      ensNameLength: ensName.length
    });
    setEnsJudgeChip({ statusId: "ens-identity-status", chipText: "Set Agent ENS name first.", variant: "warning" });
    return { ok: false, reason: "missing_ens_name" };
  }
  if (!arcActorAddress) {
    setEnsJudgeChip({ statusId: "ens-identity-status", chipText: "Set Arc actor address for the ENS addr record.", variant: "warning" });
    return { ok: false, reason: "missing_arc_actor_address" };
  }
  if (!agentId) {
    setEnsJudgeChip({ statusId: "ens-identity-status", chipText: "Set agentId text record value.", variant: "warning" });
    return { ok: false, reason: "missing_agent_id" };
  }

  setEnsJudgeChip({
    statusId: "ens-identity-status",
    chipText:
      writeMode === "demo"
        ? "Preparing ENS setup (demo mode)..."
        : "Submitting ENS setup transaction... If ENS name is unowned, commit->register can take ~60-90s.",
    variant: "warning"
  });
  if (writeMode !== "demo") {
    startEnsSubmissionTimer();
  } else {
    stopEnsSubmissionTimer();
  }

  const payload = {
    ensName,
    arcActorAddress,
    agentId,
    tokenUri,
    capabilitiesUri,
    allowedIntent: allowedIntentsCsv || selectedIntent,
    ensip25Registry,
    ensip25AgentId,
    ensip25Value,
    attestor,
    attestationUpdatedAt: new Date().toISOString(),
    highRiskIntents,
    payoutMode,
    privacyReceiver,
    privacyUpdatedAt: privacyReceiver ? new Date().toISOString() : "",
    agentVersion,
    capabilitiesVersion,
    compatibleIntents,
    writeMode
  };
  if (writeMode === "metamask") {
    debugEnsLog("M1", "public/main.js:registerUpdateEnsJudgeIdentityForUi:metamask-preflight", "metamask mode preflight", {
      hasEthereumProvider: Boolean(window.ethereum),
      hasRequestMethod: Boolean(window.ethereum && typeof window.ethereum.request === "function"),
      selectedIntent
    });
    try {
      const chainId = window.ethereum && typeof window.ethereum.request === "function"
        ? await window.ethereum.request({ method: "eth_chainId" })
        : null;
      const accounts = window.ethereum && typeof window.ethereum.request === "function"
        ? await window.ethereum.request({ method: "eth_accounts" })
        : [];
      debugEnsLog("M2", "public/main.js:registerUpdateEnsJudgeIdentityForUi:metamask-state", "metamask provider state", {
        chainId: chainId || null,
        accountCount: Array.isArray(accounts) ? accounts.length : 0
      });

      // Force wallet interaction in MetaMask mode so judges see explicit user-approved signing.
      const requestedAccounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const signer = Array.isArray(requestedAccounts) ? requestedAccounts[0] || "" : "";
      debugEnsLog("M4", "public/main.js:registerUpdateEnsJudgeIdentityForUi:metamask-request-accounts", "metamask accounts requested", {
        accountCount: Array.isArray(requestedAccounts) ? requestedAccounts.length : 0,
        hasSigner: Boolean(signer)
      });
      if (!signer) {
        setEnsJudgeChip({
          statusId: "ens-identity-status",
          chipText: "MetaMask account connection was not approved.",
          variant: "warning"
        });
      stopEnsSubmissionTimer();
        return { ok: false, reason: "metamask_not_approved" };
      }

      const proofMessage = `Authorize ENS update intent for ${ensName} at ${new Date().toISOString()}`;
      const proofSignature = await window.ethereum.request({
        method: "personal_sign",
        params: [proofMessage, signer]
      });
      debugEnsLog("M5", "public/main.js:registerUpdateEnsJudgeIdentityForUi:metamask-sign", "metamask proof signature captured", {
        hasSignature: Boolean(proofSignature),
        signerLength: signer.length
      });
      payload.metamaskSigner = signer;
      payload.metamaskProofMessage = proofMessage;
      payload.metamaskProofSignature = proofSignature;
      setEnsJudgeChip({
        statusId: "ens-identity-status",
        chipText: "MetaMask signature captured. Submitting ENS setup...",
        variant: "success"
      });
    } catch (error) {
      debugEnsLog("M2", "public/main.js:registerUpdateEnsJudgeIdentityForUi:metamask-state", "metamask provider state failed", {
        error: error?.message || String(error)
      });
      setEnsJudgeChip({
        statusId: "ens-identity-status",
        chipText: error?.message || "MetaMask interaction failed.",
        variant: "warning"
      });
      stopEnsSubmissionTimer();
      return { ok: false, reason: "metamask_failed" };
    }
  }

  const data = await request("/api/ens/setup-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (writeMode === "metamask") {
    debugEnsLog("M3", "public/main.js:registerUpdateEnsJudgeIdentityForUi:metamask-server-response", "metamask mode server response", {
      status: data.status,
      ok: data.ok,
      errorCode: data.body?.error?.code || null
    });
  }

  if (!data.ok) {
    const rawErrorMessage = data.body?.error?.message || "ENS setup failed.";
    let displayMessage = rawErrorMessage;
    if (/insufficient funds for gas \* price \+ value/i.test(rawErrorMessage)) {
      const haveMatch = rawErrorMessage.match(/have\s+(\d+)/i);
      const wantMatch = rawErrorMessage.match(/want\s+(\d+)/i);
      if (haveMatch?.[1] && wantMatch?.[1]) {
        try {
          const haveWei = BigInt(haveMatch[1]);
          const wantWei = BigInt(wantMatch[1]);
          const shortfallWei = wantWei > haveWei ? wantWei - haveWei : 0n;
          const shortfallEth = formatEthFromWeiString(shortfallWei.toString()) || shortfallWei.toString();
          displayMessage = `Insufficient SepoliaETH for ENS registration. Top up signer by at least ~${shortfallEth} ETH and retry.`;
        } catch (_error) {
          displayMessage = rawErrorMessage;
        }
      }
    }
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: displayMessage,
      variant: "warning"
    });
    stopEnsSubmissionTimer();
    return { ok: false, status: data.status, body: data.body };
  }

  if (data.body?.demo_mode) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Demo mode: payload validated. No onchain write was sent.",
      variant: "success"
    });
    stopEnsSubmissionTimer();
    print("ens-identity-output", { route: "/api/ens/setup-agent", request: payload, body: data.body });
    return { ok: true, demo_mode: true, status: data.status, body: data.body };
  }

  stopEnsSubmissionTimer();
  print("ens-identity-output", { route: "/api/ens/setup-agent", request: payload, body: data.body });
  await resolveEnsJudgeIdentityForUi();
  return { ok: true, status: data.status, body: data.body };
}

async function verifyEnsAttestationFromUi() {
  const ensInput = document.getElementById("ens-name-input");
  const globalInput = document.getElementById("agent-ens-name");
  const ensName = normalizeEnsNameInput(ensInput?.value || globalInput?.value || "");
  const selectedIntent = document.getElementById("agent-intent")?.value || "";
  const registry = document.getElementById("ensip25-registry")?.value?.trim() || "";
  const agentId = document.getElementById("ensip25-agent-id")?.value?.trim() || document.getElementById("ens-agent-id")?.value?.trim() || "";
  if (!ensName) {
    setEnsJudgeChip({
      statusId: "ens-trust-chip",
      chipText: "Set ENS name first.",
      variant: "warning"
    });
    return { ok: false, reason: "missing_ens_name" };
  }
  const response = await request("/api/ens/verify-attestation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ensName, intent: selectedIntent, registry, agentId })
  });
  if (!response.ok) {
    setEnsJudgeChip({
      statusId: "ens-trust-chip",
      chipText: response.body?.error?.message || "Attestation verification failed.",
      variant: "warning"
    });
    return { ok: false, status: response.status, body: response.body };
  }
  const trust = response.body?.trust || {};
  const ensip25 = response.body?.ensip25 || {};
  setEnsJudgeChip({
    statusId: "ens-trust-chip",
    chipText: `Trust verify: spec=${trust.ensip25_spec_verified}; registry=${trust.registry_side_verified}; bidirectional=${trust.ensip25_bidirectional_verified}; highRisk=${trust.is_high_risk_intent}; trustedForIntent=${trust.is_trusted_for_intent}; key=${ensip25.key || "unset"}`,
    variant: trust.is_trusted_for_intent ? "success" : "warning"
  });
  renderEnsTrustBadges(trust);
  print("ens-identity-output", { route: "/api/ens/verify-attestation", body: response.body });
  return { ok: true, status: response.status, body: response.body };
}

async function upsertRegistryLinkFromUi() {
  const ensInput = document.getElementById("ens-name-input");
  const globalInput = document.getElementById("agent-ens-name");
  const ensName = normalizeEnsNameInput(ensInput?.value || globalInput?.value || "");
  const agentId = document.getElementById("ensip25-agent-id")?.value?.trim() || document.getElementById("ens-agent-id")?.value?.trim() || "";
  const registry = document.getElementById("ensip25-registry")?.value?.trim() || "";
  const tokenUri = document.getElementById("ens-token-uri")?.value?.trim() || "";
  const capabilitiesUri = document.getElementById("ens-capabilities-uri")?.value?.trim() || "";
  const active = true;

  if (!ensName) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Set ENS name first.",
      variant: "warning"
    });
    return { ok: false, reason: "missing_ens_name" };
  }
  if (!agentId) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Set ENSIP-25 agentId first.",
      variant: "warning"
    });
    return { ok: false, reason: "missing_agent_id" };
  }
  if (!registry) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Set ENSIP-25 registry interop first.",
      variant: "warning"
    });
    return { ok: false, reason: "missing_registry" };
  }

  setEnsJudgeChip({
    statusId: "ens-identity-status",
    chipText: "Submitting registry upsert...",
    variant: "warning"
  });

  const response = await request("/api/ens/registry/upsert-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ensName,
      agentId,
      registry,
      tokenUri,
      capabilitiesUri,
      metadataUri: "",
      active
    })
  });
  if (!response.ok) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: response.body?.error?.message || "Registry upsert failed.",
      variant: "warning"
    });
    print("ens-identity-output", { route: "/api/ens/registry/upsert-agent", request: { ensName, agentId, registry }, body: response.body });
    return { ok: false, status: response.status, body: response.body };
  }

  setEnsJudgeChip({
    statusId: "ens-identity-status",
    chipText: `Registry upsert submitted: ${response.body?.tx_hash || "ok"}`,
    variant: "success"
  });
  print("ens-identity-output", { route: "/api/ens/registry/upsert-agent", request: { ensName, agentId, registry }, body: response.body });

  await verifyEnsAttestationFromUi();
  await resolveEnsJudgeIdentityForUi();
  return { ok: true, status: response.status, body: response.body };
}

async function runEnsip25GuidedFlowFromUi() {
  const writeMode = document.getElementById("ens-write-mode")?.value || "demo";
  setEnsStepStatus("ens-step-write", "active");
  setEnsStepStatus("ens-step-upsert", null);
  setEnsStepStatus("ens-step-verify", null);
  setEnsStepStatus("ens-step-resolve", null);

  const writeResult = await registerUpdateEnsJudgeIdentityForUi();
  if (!writeResult?.ok) {
    setEnsStepStatus("ens-step-write", "failed");
    return { ok: false, stage: "write", detail: writeResult };
  }
  setEnsStepStatus("ens-step-write", "done");
  if (writeResult.demo_mode || writeMode === "demo") {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Demo mode completed preview only. Switch ENS write mode to Circle Wallet or MetaMask for live onchain setup.",
      variant: "warning"
    });
    return { ok: false, reason: "demo_write_mode" };
  }

  setEnsStepStatus("ens-step-upsert", "active");
  const upsertResult = await upsertRegistryLinkFromUi();
  if (!upsertResult?.ok) {
    setEnsStepStatus("ens-step-upsert", "failed");
    return { ok: false, stage: "upsert", detail: upsertResult };
  }
  setEnsStepStatus("ens-step-upsert", "done");

  setEnsStepStatus("ens-step-verify", "active");
  const verifyResult = await verifyEnsAttestationFromUi();
  if (!verifyResult?.ok) {
    setEnsStepStatus("ens-step-verify", "failed");
    return { ok: false, stage: "verify", detail: verifyResult };
  }
  const trust = verifyResult.body?.trust || {};
  if (!trust.ensip25_bidirectional_verified) {
    setEnsStepStatus("ens-step-verify", "failed");
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Verification ran, but bidirectional trust is still false. Check ENS name, agentId, and registry interop match.",
      variant: "warning"
    });
    return { ok: false, stage: "verify_not_bidirectional", trust };
  }
  setEnsStepStatus("ens-step-verify", "done");

  setEnsStepStatus("ens-step-resolve", "active");
  const resolveResult = await resolveEnsJudgeIdentityForUi();
  if (!resolveResult?.ok) {
    setEnsStepStatus("ens-step-resolve", "failed");
    return { ok: false, stage: "resolve", detail: resolveResult };
  }
  setEnsStepStatus("ens-step-resolve", "done");
  setEnsJudgeChip({
    statusId: "ens-identity-status",
    chipText: "Guided ENSIP-25 flow completed. Bidirectional trust is verified.",
    variant: "success"
  });
  return { ok: true };
}

async function checkEnsSignerBalanceFromUi() {
  const source = document.getElementById("ens-arc-address-source")?.value || "metamask";
  let selectedAddress = "";
  if (source === "metamask") {
    if (!window.ethereum) {
      setEnsJudgeChip({
        statusId: "ens-signer-balance-chip",
        chipText: "MetaMask provider not found in browser.",
        variant: "warning"
      });
      return;
    }
    await connectMetaMask();
    selectedAddress = connectedAccount || "";
  } else {
    const circle = lastCreatedCircleWallet || getWalletDetailsFromOutputPane();
    selectedAddress = circle?.walletAddress || "";
  }
  if (!selectedAddress) {
    setEnsJudgeChip({
      statusId: "ens-signer-balance-chip",
      chipText: source === "circle_wallet"
        ? "No created Circle wallet found yet. Create/save a Circle wallet first."
        : "No MetaMask wallet connected yet.",
      variant: "warning"
    });
    return;
  }
  debugEnsLog("H6", "public/main.js:checkEnsSignerBalanceFromUi", "checking selected source balance", {
    source,
    addressLength: selectedAddress.length
  });
  const data = await request(`/api/ens/address-balance?address=${encodeURIComponent(selectedAddress)}`, { method: "GET" });
  if (!data.ok) {
    setEnsJudgeChip({
      statusId: "ens-signer-balance-chip",
      chipText: data.body?.error?.message || "Failed to load selected wallet balance.",
      variant: "warning"
    });
    return;
  }
  const needsTopUp = Boolean(data.body?.needs_top_up);
  const sourceLabel = source === "circle_wallet" ? "circle wallet" : "MetaMask wallet";
  setEnsJudgeChip({
    statusId: "ens-signer-balance-chip",
    chipText: `Selected ${sourceLabel} ${data.body?.address || ""} | Sepolia ETH: ${data.body?.balance_eth || "0"}${needsTopUp ? " (top up required)" : ""}`,
    variant: needsTopUp ? "warning" : "success"
  });
  print("ens-identity-output", { route: "/api/ens/address-balance", body: data.body, source });
}

async function checkEnsNameStatusFromUi() {
  const ensInput = document.getElementById("ens-name-input");
  const globalInput = document.getElementById("agent-ens-name");
  const ensName = normalizeEnsNameInput(ensInput?.value || globalInput?.value || "");
  if (ensInput && ensInput.value !== ensName) {
    ensInput.value = ensName;
  }
  if (globalInput && globalInput.value !== ensName) {
    globalInput.value = ensName;
  }
  if (!ensName) {
    setEnsJudgeChip({
      statusId: "ens-name-status-chip",
      chipText: "Set ENS name first to check ownership and registration minimum.",
      variant: "warning"
    });
    return;
  }
  debugEnsLog("H9", "public/main.js:checkEnsNameStatusFromUi", "checking ENS name status", {
    ensNameLength: ensName.length
  });
  const data = await request(`/api/ens/name-status?name=${encodeURIComponent(ensName)}`, { method: "GET" });
  if (!data.ok) {
    setEnsJudgeChip({
      statusId: "ens-name-status-chip",
      chipText: data.body?.error?.message || "Failed to check ENS name status.",
      variant: "warning"
    });
    return;
  }
  const isOwned = Boolean(data.body?.is_owned);
  const requiredEth = data.body?.registration?.required_value_eth || "0";
  const signerShortfall = data.body?.signer?.shortfall_eth || "0";
  const signerHasEnough = Boolean(data.body?.signer?.has_enough_for_registration_value);
  const ownerAddress = data.body?.owner || "none";
  const message = isOwned
    ? `ENS name is already owned by ${ownerAddress}.`
    : signerHasEnough
      ? `ENS name appears unowned. Registration value estimate: ~${requiredEth} SepoliaETH (plus gas). Signer balance looks sufficient.`
      : `ENS name appears unowned. Registration value estimate: ~${requiredEth} SepoliaETH (plus gas). Top up signer by ~${signerShortfall} SepoliaETH.`;
  setEnsJudgeChip({
    statusId: "ens-name-status-chip",
    chipText: message,
    variant: isOwned || signerHasEnough ? "success" : "warning"
  });
  print("ens-identity-output", { route: "/api/ens/name-status", body: data.body });
}

async function fillEnsArcActorAddressFromSelectedSource() {
  const source = document.getElementById("ens-arc-address-source")?.value || "metamask";
  const targetInput = document.getElementById("ens-arc-actor-address");
  if (!targetInput) {
    return;
  }
  debugEnsLog("H7", "public/main.js:fillEnsArcActorAddressFromSelectedSource", "arc actor fill requested", {
    source,
    hasConnectedAccount: Boolean(connectedAccount),
    hasLastCreatedCircleWallet: Boolean(lastCreatedCircleWallet)
  });

  if (source === "metamask") {
    if (!window.ethereum) {
      setEnsJudgeChip({
        statusId: "ens-identity-status",
        chipText: "MetaMask provider not found in browser.",
        variant: "warning"
      });
      return;
    }
    await connectMetaMask();
    if (!connectedAccount) {
      setEnsJudgeChip({
        statusId: "ens-identity-status",
        chipText: "No MetaMask account connected yet.",
        variant: "warning"
      });
      return;
    }
    targetInput.value = connectedAccount;
    debugEnsLog("H8", "public/main.js:fillEnsArcActorAddressFromSelectedSource", "filled arc actor from metamask", {
      source,
      addressLength: connectedAccount.length
    });
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Arc actor address filled from MetaMask connected wallet.",
      variant: "success"
    });
    return;
  }

  const circle = lastCreatedCircleWallet || getWalletDetailsFromOutputPane();
  if (!circle?.walletAddress) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "No created Circle wallet found yet. Create/save a Circle wallet first.",
      variant: "warning"
    });
    return;
  }
  targetInput.value = circle.walletAddress;
  debugEnsLog("H8", "public/main.js:fillEnsArcActorAddressFromSelectedSource", "filled arc actor from circle wallet", {
    source,
    addressLength: circle.walletAddress.length
  });
  setEnsJudgeChip({
    statusId: "ens-identity-status",
    chipText: "Arc actor address filled from created Circle wallet.",
    variant: "success"
  });
}

async function getLastAgentSessionFromUi() {
  if (!lastAgentSessionId) {
    print("agent-output", { info: "No agent session id yet. Run a session first." });
    return;
  }
  const response = await request(`/api/agents/sessions/${encodeURIComponent(lastAgentSessionId)}`);
  print("agent-output", {
    route: `/api/agents/sessions/${lastAgentSessionId}`,
    ok: response.ok,
    status: response.status,
    body: response.body
  });
}

async function evaluateSettlementFromUi() {
  const amountMinor = Number(document.getElementById("settlement-amount-minor").value || 0);
  const response = await request("/api/settlement/vyper/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: "payments-agent",
      amount_minor: amountMinor,
      intent: "ui_manual_check"
    })
  });
  print("agent-output", {
    route: "/api/settlement/vyper/evaluate",
    ok: response.ok,
    status: response.status,
    body: response.body
  });
}

function resetEthglobalHackathonStepChips() {
  ["ethglobal-demo-step-seed", "ethglobal-demo-step-ens", "ethglobal-demo-step-vyper", "ethglobal-demo-step-ucp", "ethglobal-demo-step-close", "ethglobal-demo-step-keeperhub"].forEach((id) => {
    setEnsStepStatus(id, null);
  });
}

function flushEthglobalHackathonOutput(timeline, meta = {}) {
  print("ethglobal-hackathon-output", {
    hackathon_demo: true,
    ...meta,
    timeline_steps: timeline
  });
}

function summarizeFailedAgentSession(session) {
  if (!session || session.status === "completed") {
    return {};
  }
  const trace = Array.isArray(session.trace) ? session.trace : [];
  let lastErrorMessage = null;
  for (let i = trace.length - 1; i >= 0; i -= 1) {
    if (trace[i]?.kind === "error" && trace[i]?.message) {
      lastErrorMessage = trace[i].message;
      break;
    }
  }
  return {
    session_summary: session.summary || null,
    last_trace_error: lastErrorMessage
  };
}

function applyEnsJudgeNineIntentCsvFromUi() {
  const el = document.getElementById("ens-allowed-intents-csv");
  if (!el) return;
  el.value = ALL_ORCHESTRATOR_INTENTS_CSV;
  setEnsJudgeChip({
    statusId: "ens-gating-chip",
    chipText:
      "allowedIntents = all 9 orchestrator intents. Run ENSIP-25 guided write to publish. High-risk intents still require bidirectional ENSIP-25.",
    variant: "warning"
  });
}

function resetEnsJudgeNameDraftFromUi() {
  const nameEl = document.getElementById("ens-name-input");
  if (!nameEl) return;
  nameEl.value = "";
  nameEl.placeholder = "your-new-judge.eth (Sepolia ENS)";
  nameEl.focus();
  maybeAutoFillAgentIdFromEnsName();
}

async function runNineIntentMarathonDemoFromUi() {
  const amountMinor = Number(document.getElementById("agent-marathon-minor")?.value || DEMO_USDC_MINOR);
  const rail = document.getElementById("agent-marathon-payment-mode")?.value || "offchain_demo";
  const ctxEl = document.getElementById("agent-context-json");
  const intentSelect = document.getElementById("agent-intent");
  const paymentSelect = document.getElementById("agent-payment-mode");
  if (!ctxEl || !intentSelect || !paymentSelect) return;
  if (rail === "x402") {
    print("agent-marathon-output", {
      error: "Nine-intent marathon does not drive x402. Pick offchain demo, Circle, or MetaMask."
    });
    return;
  }
  const restoreCtx = ctxEl.value;
  const restoreIntent = intentSelect.value;
  const restorePay = paymentSelect.value;
  const intents = ALL_ORCHESTRATOR_INTENTS_CSV.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const timeline = [];
  let stopped = false;
  try {
    paymentSelect.value = rail;
    let baseCtx = {};
    try {
      if (restoreCtx.trim()) {
        baseCtx = JSON.parse(restoreCtx);
      }
    } catch (_ignore) {
      baseCtx = {};
    }
    for (const intent of intents) {
      intentSelect.value = intent;
      ctxEl.value = JSON.stringify({ ...baseCtx, amount_minor: amountMinor });
      try {
        await runAgentSessionFromUi();
        const sid = lastAgentSessionId;
        let sess = null;
        if (sid) {
          const chk = await request(`/api/agents/sessions/${encodeURIComponent(sid)}`);
          sess = chk.body?.session || null;
        }
        const row = {
          intent,
          session_id: sid || null,
          status: sess?.status || null
        };
        if (sess?.status === "failed") {
          Object.assign(row, summarizeFailedAgentSession(sess));
        }
        timeline.push(row);
        if (!sid || sess?.status !== "completed") {
          stopped = true;
          break;
        }
      } catch (err) {
        timeline.push({ intent, ok: false, error: err?.message || String(err) });
        stopped = true;
        break;
      }
    }
  } finally {
    ctxEl.value = restoreCtx;
    intentSelect.value = restoreIntent;
    paymentSelect.value = restorePay;
  }
  const allCompleted =
    !stopped &&
    timeline.length === intents.length &&
    timeline.every((row) => String(row.status) === "completed");
  print("agent-marathon-output", {
    ok: allCompleted,
    demo_amount_minor: amountMinor,
    payment_mode_used: rail,
    timeline
  });
}

function syncEthglobalHackathonPanels() {
  const ensName = normalizeEnsNameInput(document.getElementById("ethglobal-demo-ens-name")?.value || "");
  const ensInput = document.getElementById("ens-name-input");
  const agentEns = document.getElementById("agent-ens-name");
  if (ensInput) ensInput.value = ensName;
  if (agentEns) agentEns.value = ensName;
  const agentId = deriveAgentIdFromEnsName(ensName);
  const ensAgentIdEl = document.getElementById("ens-agent-id");
  const ensip25AgentEl = document.getElementById("ensip25-agent-id");
  if (agentId && ensAgentIdEl) ensAgentIdEl.value = agentId;
  if (agentId && ensip25AgentEl) ensip25AgentEl.value = agentId;
  const reg = document.getElementById("ethglobal-demo-registry-interop")?.value?.trim() || "";
  const ensip25Reg = document.getElementById("ensip25-registry");
  if (ensip25Reg) ensip25Reg.value = reg;

  const minHackEntry = DEMO_USDC_MINOR;
  const feeRaw = Number(document.getElementById("ethglobal-demo-entry-fee")?.value || DEMO_USDC_MINOR);
  const fee = feeRaw >= minHackEntry ? feeRaw : minHackEntry;
  document.getElementById("entry-fee").value = String(fee);

  document.getElementById("battle-mode").value = document.getElementById("ethglobal-demo-battle-payment-mode").value;
  document.getElementById("battle-execution-mode").value = document.getElementById("ethglobal-demo-execution-mode").value;
  document.getElementById("battle-execution-network").value = document.getElementById("ethglobal-demo-execution-network").value;

  document.getElementById("agent-execution-mode").value = document.getElementById("ethglobal-demo-execution-mode").value;
  document.getElementById("agent-execution-network").value = document.getElementById("ethglobal-demo-execution-network").value;

  document.getElementById("keeperhub-execution-mode").value = document.getElementById("ethglobal-demo-execution-mode").value;
  document.getElementById("keeperhub-execution-network").value = document.getElementById("ethglobal-demo-execution-network").value;

  document.getElementById("keeperhub-on-payout").checked = Boolean(
    document.getElementById("ethglobal-demo-execute-keeperhub").checked
  );
}

async function hackathonResolveWinnerEntryId() {
  const data = await request("/api/battle");
  const entrants = data.body?.entrants || [];
  const matches = entrants.filter((e) => e.dancer_name === ETHGLOBAL_HACK_WINNER_LABEL);
  if (!matches.length) return null;
  return matches[matches.length - 1].id;
}

async function registerHackathonBattleSeedEntrant({ dancer_name, wallet, timeline }) {
  const amountMinor = Number(document.getElementById("entry-fee").value || DEMO_USDC_MINOR);
  const mode = document.getElementById("battle-mode").value || "offchain_demo";
  const execution = getExecutionSelection("battle-execution-mode", "battle-execution-network");
  const payment = await resolvePaymentReference(mode, amountMinor, "ethglobal-demo-battle-seed");
  const response = await request("/api/battle/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dancer_name,
      wallet,
      entry_fee_minor: amountMinor,
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  timeline.push({
    step: "battle_register",
    at: new Date().toISOString(),
    dancer_name,
    ok: response.ok,
    status: response.status
  });
  flushEthglobalHackathonOutput(timeline, { running: true });
  return response;
}

/**
 * Eight Circle-funded commerce beats (after Vyper, before hackathon agent session).
 * Each beat performs a POST that triggers maybeExecuteOnlineTransfer with client payment_ref.
 */
async function runEthglobalHackathonEightCircleCommercialBeats(timeline, { ensName }) {
  const execution = getExecutionSelection("battle-execution-mode", "battle-execution-network");
  const circleMode = "circle_wallet";
  const beatSummaries = [];
  const judgeName = judgeLabelFromEns(ensName);
  const topicLabel = `ethglobal-wow-${Date.now()}`;

  // #region agent log
  fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
    body: JSON.stringify({
      sessionId: "995d4d",
      location: "public/main.js:runEthglobalHackathonEightCircleCommercialBeats",
      message: "wow_eight_enter",
      data: {
        execution_mode: execution.execution_mode,
        execution_network: execution.execution_network,
        judgeNameLen: judgeName.length
      },
      timestamp: Date.now(),
      hypothesisId: "H1",
      runId: "pre-fix"
    })
  }).catch(() => {});
  // #endregion

  const bump = (id, ok, status, extra = {}) => {
    beatSummaries.push({ id, ok, status, ...extra });
  };

  const amtDemo = DEMO_USDC_MINOR;

  const payU1 = await resolvePaymentReference(circleMode, amtDemo, "ethglobal-wow-u1-tip", "");
  const u1 = await request("/api/tips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fan_name: "ETHGlobal Judge",
      dancer_id: "dancer-1",
      amount_minor: amtDemo,
      payment_mode: payU1.mode,
      payment_ref: payU1.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u1_tip", u1.ok, u1.status);
  timeline.push({ step: "wow_circle_u1_tip", ok: u1.ok, status: u1.status, amount_minor: amtDemo });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u1.ok) {
    throw new Error(`WOW U1 tip failed (HTTP ${u1.status})`);
  }

  const clipList = await request("/api/tutorials");
  const clip = (clipList.body?.tutorials || []).find((row) => row.id === "clip-1");
  if (!clip) {
    throw new Error("WOW U2 clip-1 missing");
  }
  const amtU2 = Number(clip.priceMinor);
  const payU2 = await resolvePaymentReference(circleMode, amtU2, "ethglobal-wow-u2-pay", "");
  const u2 = await request("/api/tutorials/clip-1/pay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer_name: "ETHGlobal WOW",
      payment_mode: payU2.mode,
      payment_ref: payU2.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u2_pay", u2.ok, u2.status, { amount_minor: amtU2 });
  timeline.push({ step: "wow_circle_u2_tutorial", ok: u2.ok, status: u2.status, amount_minor: amtU2 });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u2.ok) {
    throw new Error(`WOW U2 tutorial pay failed (HTTP ${u2.status})`);
  }

  const payU3 = await resolvePaymentReference(circleMode, amtDemo, "ethglobal-wow-u3-feedback", "");
  const u3 = await request("/api/judge-feedback/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dancer_name: "WOW Demo",
      judge_name: judgeName,
      topic: topicLabel,
      amount_minor: amtDemo,
      payment_mode: payU3.mode,
      payment_ref: payU3.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u3_feedback", u3.ok, u3.status);
  timeline.push({
    step: "wow_circle_u3_judge_feedback",
    ok: u3.ok,
    status: u3.status,
    request_id: u3.body?.request?.id || null
  });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u3.ok) {
    throw new Error(`WOW U3 judge feedback failed (HTTP ${u3.status})`);
  }

  const crewName = `ETHGlobal WOW Crew ${Date.now().toString(36)}`;
  const crewRes = await request("/api/crews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: crewName,
      members: [
        { name: "NOVA", wallet: "0x1111111111111111111111111111111111111111", share_bps: 5000 },
        { name: "SHADOW", wallet: "0x2222222222222222222222222222222222222222", share_bps: 3000 },
        { name: "RAWFIRE", wallet: "0x3333333333333333333333333333333333333333", share_bps: 2000 }
      ]
    })
  });
  if (!crewRes.ok || !crewRes.body?.crew?.id) {
    bump("u4_create", crewRes.ok, crewRes.status);
    throw new Error(`WOW U4 crew create failed (HTTP ${crewRes.status})`);
  }
  bump("u4_create", true, crewRes.status);
  const crewId = crewRes.body.crew.id;
  const payU4 = await resolvePaymentReference(circleMode, amtDemo, "ethglobal-wow-u4-split", "");
  const u4 = await request(`/api/crews/${encodeURIComponent(crewId)}/split-settlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount_minor: amtDemo,
      source: "ethglobal_wow",
      payment_mode: payU4.mode,
      payment_ref: payU4.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u4_split", u4.ok, u4.status);
  timeline.push({ step: "wow_circle_u4_crew_split", ok: u4.ok, status: u4.status, crew_id: crewId });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u4.ok) {
    throw new Error(`WOW U4 split failed (HTTP ${u4.status})`);
  }

  // #region agent log
  fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
    body: JSON.stringify({
      sessionId: "995d4d",
      location: "public/main.js:runEthglobalHackathonEightCircleCommercialBeats:mid",
      message: "wow_eight_mid_after_u4",
      data: { beatSummaries: beatSummaries.slice() },
      timestamp: Date.now(),
      hypothesisId: "H2",
      runId: "pre-fix"
    })
  }).catch(() => {});
  // #endregion

  const roomsData = await request("/api/practice-rooms");
  const room =
    (roomsData.body?.rooms || []).find((r) => r.id === "room-1") || (roomsData.body?.rooms || [])[0];
  if (!room) {
    throw new Error("WOW U6 no practice room");
  }
  const plannedMinutes = 5;
  const u6Estimate = Number(room.rate_minor_per_min || 1) * plannedMinutes;
  const payU6 = await resolvePaymentReference(circleMode, u6Estimate, "ethglobal-wow-u6-reserve", "");
  const u6 = await request("/api/practice-bookings/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_id: room.id,
      dancer_name: "ETHGlobal WOW",
      planned_minutes: plannedMinutes,
      payment_mode: payU6.mode,
      payment_ref: payU6.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u6_reserve", u6.ok, u6.status, { estimated_minor: u6Estimate });
  timeline.push({
    step: "wow_circle_u6_practice",
    ok: u6.ok,
    status: u6.status,
    estimated_minor: u6Estimate,
    booking_id: u6.body?.booking?.id || null
  });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u6.ok) {
    throw new Error(`WOW U6 practice reserve failed (HTTP ${u6.status})`);
  }

  const packsRes = await request("/api/sample-packs");
  const pack = (packsRes.body?.packs || []).find((p) => p.id === "pack-1");
  const tier = pack?.tiers?.find((t) => t.id === "tier-personal");
  if (!pack || !tier) {
    throw new Error("WOW U7 pack-1 / tier-personal missing");
  }
  const amtU7 = Number(tier.price_minor || DEMO_USDC_MINOR);
  const payU7 = await resolvePaymentReference(circleMode, amtU7, "ethglobal-wow-u7-pack", "");
  const u7 = await request("/api/sample-packs/pack-1/purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tier_id: "tier-personal",
      buyer_name: "ETHGlobal WOW",
      payment_mode: payU7.mode,
      payment_ref: payU7.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u7_pack", u7.ok, u7.status, { amount_minor: amtU7 });
  timeline.push({ step: "wow_circle_u7_sample_pack", ok: u7.ok, status: u7.status, amount_minor: amtU7 });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u7.ok) {
    throw new Error(`WOW U7 sample pack failed (HTTP ${u7.status})`);
  }

  const chCreate = await request("/api/challenges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `ETHGlobal WOW U8 ${Date.now().toString(36)}`,
      sponsor_name: "WOW Demo",
      bounty_minor: amtDemo
    })
  });
  if (!chCreate.ok || !chCreate.body?.challenge?.id) {
    bump("u8_create", chCreate.ok, chCreate.status);
    throw new Error(`WOW U8 create failed (HTTP ${chCreate.status})`);
  }
  const challengeId = chCreate.body.challenge.id;
  bump("u8_create", true, chCreate.status);
  timeline.push({
    step: "wow_u8_challenge_create",
    ok: true,
    challenge_id: challengeId,
    bounty_minor: amtDemo
  });
  flushEthglobalHackathonOutput(timeline, { running: true });

  const subRes = await request(`/api/challenges/${encodeURIComponent(challengeId)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dancer_name: "ETHGlobal WOW",
      clip_url: "https://example.com/ethglobal-wow-clip"
    })
  });
  if (!subRes.ok || !subRes.body?.submission?.id) {
    bump("u8_submit", subRes.ok, subRes.status);
    throw new Error(`WOW U8 submit failed (HTTP ${subRes.status})`);
  }
  const submissionId = subRes.body.submission.id;
  bump("u8_submit", true, subRes.status);
  timeline.push({ step: "wow_u8_submit", submission_id: submissionId });
  flushEthglobalHackathonOutput(timeline, { running: true });

  const scoreRes = await request(`/api/challenges/${encodeURIComponent(challengeId)}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submission_id: submissionId, score: 94 })
  });
  bump("u8_score", scoreRes.ok, scoreRes.status);
  timeline.push({ step: "wow_u8_score", ok: scoreRes.ok, status: scoreRes.status });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!scoreRes.ok) {
    throw new Error(`WOW U8 score failed (HTTP ${scoreRes.status})`);
  }

  const bountyMinor = Number(chCreate.body?.challenge?.bounty_minor || amtDemo);
  const payU8 = await resolvePaymentReference(circleMode, bountyMinor, "ethglobal-wow-u8-payout", "");
  const u8p = await request(`/api/challenges/${encodeURIComponent(challengeId)}/payout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      winner_submission_id: submissionId,
      payment_mode: payU8.mode,
      payment_ref: payU8.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u8_payout", u8p.ok, u8p.status, { amount_minor: bountyMinor });
  timeline.push({
    step: "wow_circle_u8_challenge_payout",
    ok: u8p.ok,
    status: u8p.status,
    amount_minor: bountyMinor,
    challenge_id: challengeId
  });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u8p.ok) {
    throw new Error(`WOW U8 payout failed (HTTP ${u8p.status})`);
  }

  const itemId = "merch-1";
  const quantity = 1;
  const cat = await request("/api/merch/catalog");
  const merchItem = (cat.body?.items || []).find((row) => row.id === itemId);
  if (!merchItem) {
    throw new Error("WOW U10 merch-1 missing");
  }
  const amtU10 = Number(merchItem.price_minor || DEMO_USDC_MINOR) * quantity;
  const payU10 = await resolvePaymentReference(circleMode, amtU10, "ethglobal-wow-u10-checkout", "");
  const u10 = await request("/api/merch/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_id: itemId,
      quantity,
      buyer_name: "ETHGlobal WOW",
      payment_mode: payU10.mode,
      payment_ref: payU10.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    })
  });
  bump("u10_checkout", u10.ok, u10.status, { amount_minor: amtU10 });
  timeline.push({ step: "wow_circle_u10_merch", ok: u10.ok, status: u10.status, amount_minor: amtU10 });
  flushEthglobalHackathonOutput(timeline, { running: true });
  if (!u10.ok) {
    throw new Error(`WOW U10 merch checkout failed (HTTP ${u10.status})`);
  }

  timeline.push({
    step: "wow_circle_commerce_complete",
    beats: beatSummaries.length,
    summary: beatSummaries
  });
  flushEthglobalHackathonOutput(timeline, { running: true });

  // #region agent log
  fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
    body: JSON.stringify({
      sessionId: "995d4d",
      location: "public/main.js:runEthglobalHackathonEightCircleCommercialBeats:end",
      message: "wow_eight_complete",
      data: { beatSummaries },
      timestamp: Date.now(),
      hypothesisId: "H3",
      runId: "pre-fix"
    })
  }).catch(() => {});
  // #endregion
}

async function runEthglobalHackathonDemoFromUi() {
  const timeline = [];
  const btn = document.getElementById("ethglobal-hackathon-run-demo");

  resetEthglobalHackathonStepChips();

  const ensNameEarly = normalizeEnsNameInput(document.getElementById("ethglobal-demo-ens-name")?.value || "");
  if (!ensNameEarly) {
    flushEthglobalHackathonOutput([{ step: "error", at: new Date().toISOString(), message: "Set judge ENS name (e.g. your agent .eth)." }], {
      running: false,
      ok: false
    });
    return;
  }

  const winnerInputEl = document.getElementById("ethglobal-demo-winner-wallet");
  const challengerInputEl = document.getElementById("ethglobal-demo-challenger-wallet");
  let winnerWallet = "";

  try {
    if (window.ethereum && !connectedAccount) {
      try {
        await connectMetaMask();
      } catch (_e) {
        /* wallet optional until winner fill / MetaMask rails */
      }
    }
    winnerWallet = String(winnerInputEl?.value || "").trim();
    if (!winnerWallet && connectedAccount) {
      winnerWallet = connectedAccount;
    }
    if (!winnerWallet) {
      timeline.push({
        step: "error",
        at: new Date().toISOString(),
        message: "Set winner payout wallet or connect MetaMask and use Fill winner wallet."
      });
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }
    winnerInputEl.value = winnerWallet;
  } catch (error) {
    timeline.push({ step: "error", at: new Date().toISOString(), message: error?.message || String(error) });
    flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
    return;
  }

  if (btn?.dataset.running === "1") {
    return;
  }
  if (btn) {
    btn.dataset.running = "1";
    btn.disabled = true;
  }

  try {
    syncEthglobalHackathonPanels();
    applyEthglobalHackathonExecutionModeUi();
    const hackathonAgentIntent =
      document.getElementById("ethglobal-demo-hackathon-intent")?.value || "tip_dancer";
    document.getElementById("agent-intent").value = hackathonAgentIntent;
    const payRail = document.getElementById("ethglobal-demo-battle-payment-mode").value;
    const nineCircleWow = document.getElementById("ethglobal-demo-nine-circle-wow")?.checked === true;
    if (payRail === "circle_wallet") {
      const circleBc = document.getElementById("circle-blockchain");
      if (circleBc) {
        circleBc.value = "ARC-TESTNET";
      }
    }
    timeline.push({
      step: "demo_rails",
      at: new Date().toISOString(),
      battle_payment_mode: payRail,
      nine_circle_wow: nineCircleWow,
      execution_mode: document.getElementById("ethglobal-demo-execution-mode").value,
      hackathon_agent_intent: hackathonAgentIntent,
      circle_blockchain: document.getElementById("circle-blockchain")?.value || null,
      keeperhub_local_hint:
        "KEEPERHUB_API_BASE=http://localhost:3001/api + KEEPERHUB_API_KEY_LOCAL for Arc Testnet (local KeeperHub)"
    });
    flushEthglobalHackathonOutput(timeline, { running: true });

    const ensName = normalizeEnsNameInput(document.getElementById("ethglobal-demo-ens-name")?.value || "");
    const registryInterop = document.getElementById("ethglobal-demo-registry-interop")?.value?.trim() || "";
    const agentIdEnsip25 =
      document.getElementById("ensip25-agent-id")?.value?.trim() ||
      document.getElementById("ens-agent-id")?.value?.trim() ||
      deriveAgentIdFromEnsName(ensName);

    flushEthglobalHackathonOutput(timeline, { running: true });

    /* 1 Battle seed */
    setEnsStepStatus("ethglobal-demo-step-seed", "active");
    const battlePeek = await request("/api/battle");
    if (!battlePeek.ok) {
      timeline.push({ step: "battle_peek_failed", status: battlePeek.status });
      setEnsStepStatus("ethglobal-demo-step-seed", "failed");
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }
    if (battlePeek.body?.battle_closed) {
      timeline.push({
        step: "error",
        message: "Battle is already closed. Restart the app server for a fresh U5 state."
      });
      setEnsStepStatus("ethglobal-demo-step-seed", "failed");
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }
    const entrants = battlePeek.body?.entrants || [];
    let needChallenger = !entrants.some((e) => e.dancer_name === ETHGLOBAL_HACK_CHALLENGER_LABEL);
    let needWinner = !entrants.some((e) => e.dancer_name === ETHGLOBAL_HACK_WINNER_LABEL);
    const doSeed = document.getElementById("ethglobal-demo-seed-battle")?.checked !== false;

    let challengerWallet = String(challengerInputEl?.value || "").trim() || "0x1111111111111111111111111111111111111111";
    challengerInputEl.value = challengerWallet;

    if (doSeed && needChallenger) {
      const r1 = await registerHackathonBattleSeedEntrant({
        dancer_name: ETHGLOBAL_HACK_CHALLENGER_LABEL,
        wallet: challengerWallet,
        timeline
      });
      if (!r1.ok) {
        setEnsStepStatus("ethglobal-demo-step-seed", "failed");
        flushEthglobalHackathonOutput(timeline, { running: false, ok: false, battle_error: r1.body });
        return;
      }
    }
    if (doSeed && needWinner) {
      const r2 = await registerHackathonBattleSeedEntrant({
        dancer_name: ETHGLOBAL_HACK_WINNER_LABEL,
        wallet: winnerWallet,
        timeline
      });
      if (!r2.ok) {
        setEnsStepStatus("ethglobal-demo-step-seed", "failed");
        flushEthglobalHackathonOutput(timeline, { running: false, ok: false, battle_error: r2.body });
        return;
      }
    }

    timeline.push({
      step: "battle_seed_summary",
      at: new Date().toISOString(),
      seeded_challenger: doSeed && needChallenger,
      seeded_winner: doSeed && needWinner,
      entrants_before: entrants.length
    });
    flushEthglobalHackathonOutput(timeline, { running: true });
    await refreshBattle();
    const winnerEntryProbe = await hackathonResolveWinnerEntryId();
    if (!winnerEntryProbe) {
      timeline.push({
        step: "error",
        message: "Winner entrant missing after seed. Enable seed checkbox or register ETHGlobal Winner manually."
      });
      setEnsStepStatus("ethglobal-demo-step-seed", "failed");
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }
    setEnsStepStatus("ethglobal-demo-step-seed", "done");

    /* 2 ENS + ENSIP-25 */
    setEnsStepStatus("ethglobal-demo-step-ens", "active");
    const ensStrategy = document.getElementById("ethglobal-demo-ens-strategy")?.value || "guided_live";
    if (ensStrategy === "guided_live") {
      const guided = await runEnsip25GuidedFlowFromUi();
      if (!guided?.ok) {
        timeline.push({ step: "ens_guided", ok: false, detail: guided || null });
        setEnsStepStatus("ethglobal-demo-step-ens", "failed");
        flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
        return;
      }
    } else {
      const verifyOnly = await verifyEnsAttestationFromUi();
      const trust = verifyOnly.body?.trust || {};
      const trusted = Boolean(verifyOnly.ok && trust.ensip25_bidirectional_verified && trust.is_trusted_for_intent);
      if (!trusted) {
        timeline.push({ step: "ens_verify_only", ok: false, trust });
        setEnsStepStatus("ethglobal-demo-step-ens", "failed");
        flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
        return;
      }
      await resolveEnsJudgeIdentityForUi();
      timeline.push({ step: "ens_verify_only", ok: true });
    }
    flushEthglobalHackathonOutput(timeline, { running: true });
    setEnsStepStatus("ethglobal-demo-step-ens", "done");

    /* 3 Vyper cue */
    setEnsStepStatus("ethglobal-demo-step-vyper", "active");
    document.getElementById("settlement-amount-minor").value = String(ETHGLOBAL_CHALLENGE_AMOUNT_MINOR);
    await evaluateSettlementFromUi();
    timeline.push({ step: "vyper_evaluate", amount_minor: ETHGLOBAL_CHALLENGE_AMOUNT_MINOR });
    flushEthglobalHackathonOutput(timeline, { running: true });
    setEnsStepStatus("ethglobal-demo-step-vyper", "done");

    /* 4 UCP trace: optional 8× Circle commerce (WOW), then agent session (beat 9) — intent must be listed on judge ENS allowedIntents */
    if (nineCircleWow && payRail !== "circle_wallet") {
      timeline.push({
        step: "error",
        message:
          "9× Circle WOW requires Circle wallet as battle payment mode (save wallet + ARC-TESTNET USDC). Uncheck WOW or switch payment mode."
      });
      setEnsStepStatus("ethglobal-demo-step-ucp", "failed");
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }

    setEnsStepStatus("ethglobal-demo-step-ucp", "active");
    if (nineCircleWow && payRail === "circle_wallet") {
      await runEthglobalHackathonEightCircleCommercialBeats(timeline, { ensName });
    }

    // #region agent log
    fetch("http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "995d4d" },
      body: JSON.stringify({
        sessionId: "995d4d",
        location: "public/main.js:runEthglobalHackathonDemoFromUi:beforeAgent",
        message: "wow_agent_beat_precheck",
        data: {
          nineCircleWow,
          payRail,
          intent: hackathonAgentIntent
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
        runId: "pre-fix"
      })
    }).catch(() => {});
    // #endregion

    const agentCtxSave = document.getElementById("agent-context-json")?.value || "";
    document.getElementById("agent-payment-mode").value = document.getElementById(
      "ethglobal-demo-battle-payment-mode"
    ).value;
    const ctxPayload = {
      agent_ens_name: ensName,
      ensip25_registry: registryInterop,
      amount_minor: ETHGLOBAL_CHALLENGE_AMOUNT_MINOR
    };
    if (agentIdEnsip25) {
      ctxPayload.ensip25_agent_id = agentIdEnsip25;
    }
    document.getElementById("agent-context-json").value = JSON.stringify(ctxPayload);
    await runAgentSessionFromUi();

    document.getElementById("agent-context-json").value = agentCtxSave;

    const sessionIdAfter = lastAgentSessionId || "";
    if (!sessionIdAfter) {
      timeline.push({ step: "agent_session_error", message: "No session id returned." });
      setEnsStepStatus("ethglobal-demo-step-ucp", "failed");
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }
    const fetched = await request(`/api/agents/sessions/${encodeURIComponent(sessionIdAfter)}`);
    const sess = fetched.body?.session;
    const sessOk = sess?.status === "completed";
    timeline.push({
      step: `agent_session_${hackathonAgentIntent}`,
      intent: hackathonAgentIntent,
      session_id: sessionIdAfter,
      status: sess?.status || null,
      completed: sessOk,
      ...summarizeFailedAgentSession(sess)
    });
    flushEthglobalHackathonOutput(timeline, { running: true });
    if (!sessOk) {
      setEnsStepStatus("ethglobal-demo-step-ucp", "failed");
      flushEthglobalHackathonOutput(timeline, {
        running: false,
        ok: false,
        agent_session_preview: fetched.body?.session?.trace?.length || null
      });
      return;
    }
    setEnsStepStatus("ethglobal-demo-step-ucp", "done");

    /* 5 Battle close */
    setEnsStepStatus("ethglobal-demo-step-close", "active");
    const closeRes = await request("/api/battle/close", { method: "POST" });
    timeline.push({
      step: "battle_close",
      ok: closeRes.ok,
      status: closeRes.status
    });
    flushEthglobalHackathonOutput(timeline, { running: true });
    setEnsStepStatus("ethglobal-demo-step-close", closeRes.ok ? "done" : "failed");
    if (!closeRes.ok) {
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }

    /* 6 KeeperHub payout */
    setEnsStepStatus("ethglobal-demo-step-keeperhub", "active");
    const winnerEntryId = await hackathonResolveWinnerEntryId();
    if (!winnerEntryId) {
      timeline.push({ step: "error", message: "Could not resolve winner entry after close." });
      setEnsStepStatus("ethglobal-demo-step-keeperhub", "failed");
      flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
      return;
    }
    document.getElementById("winner-id").value = winnerEntryId;
    document.getElementById("keeperhub-on-payout").checked = Boolean(document.getElementById("ethglobal-demo-execute-keeperhub").checked);
    const executeVia = Boolean(document.getElementById("ethglobal-demo-execute-keeperhub").checked);
    const payoutRes = await request("/api/battle/declare-winner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner_entry_id: winnerEntryId, execute_via_keeperhub: executeVia })
    });
    const payout = payoutRes.body?.payout || null;
    timeline.push({
      step: "declare_winner",
      winner_entry_id: winnerEntryId,
      execute_via_keeperhub: executeVia,
      settlement_status: payout?.settlement_status || null,
      keeperhub_transfer: payout?.keeperhub?.transfer || null,
      ok: payoutRes.ok
    });
    await refreshBattle();
    const keeperhubOk =
      payoutRes.ok &&
      (executeVia === false || (payout?.keeperhub && !payout.keeperhub.skipped && payout.keeperhub.ok !== false));
    setEnsStepStatus("ethglobal-demo-step-keeperhub", payoutRes.ok && keeperhubOk ? "done" : "failed");

    flushEthglobalHackathonOutput(timeline, {
      running: false,
      ok: payoutRes.ok,
      payout_body: payout,
      keeperhub_skipped_reason: payout?.keeperhub?.message || null,
      hints: executeVia ? "Explorer: payout.keeperhub.transfer for on-chain hashes (Arc testnet)." : "KeeperHub unset or checkbox off — payout record only."
    });
  } catch (error) {
    timeline.push({
      step: "error",
      at: new Date().toISOString(),
      message: error?.message || String(error)
    });
    flushEthglobalHackathonOutput(timeline, { running: false, ok: false });
  } finally {
    if (btn) {
      btn.dataset.running = "0";
      btn.disabled = false;
    }
  }
}

async function ensureMetaMaskChain() {
  if (!window.ethereum) {
    throw new Error("MetaMask not found in browser");
  }
  const chainIdHex = railConfig?.rails?.metamask?.chain_id_hex;
  if (!chainIdHex) {
    throw new Error("Missing chain config from server");
  }
  const currentChain = await window.ethereum.request({ method: "eth_chainId" });
  if (currentChain === chainIdHex) {
    return;
  }

  const meta = railConfig.rails.metamask;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }]
    });
  } catch (switchError) {
    if (switchError.code !== 4902) {
      throw switchError;
    }
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: meta.chain_name,
          rpcUrls: [meta.rpc_url],
          nativeCurrency: {
            name: meta.symbol,
            symbol: meta.symbol,
            decimals: 18
          }
        }
      ]
    });
  }
}

async function connectMetaMask() {
  if (!window.ethereum) {
    throw new Error("MetaMask not found");
  }
  await ensureMetaMaskChain();
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  connectedAccount = accounts[0] || "";
  document.getElementById("wallet-status").textContent = connectedAccount
    ? `Wallet: ${connectedAccount}`
    : "Wallet: not connected";
}

async function sendMetaMaskPayment(amountMinor) {
  await connectMetaMask();
  const to = railConfig?.rails?.metamask?.treasury_address;
  if (!to) {
    throw new Error("Set ONCHAIN_TREASURY_ADDRESS in server env");
  }
  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: connectedAccount,
        to,
        value: toHexWeiFromMinor(amountMinor)
      }
    ]
  });
  return txHash;
}

async function sendCirclePayment(amountMinor, memo) {
  const savedWalletId =
    lastCreatedCircleWallet?.walletId ||
    railConfig?.rails?.circle?.wallet_id ||
    getWalletDetailsFromOutputPane()?.walletId ||
    null;
  const response = await request("/api/payments/circle/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_minor: amountMinor, memo, wallet_id: savedWalletId })
  });
  if (!response.ok) {
    throw new Error(response.body?.error?.message || "Circle transfer failed");
  }
  const txId =
    response.body?.transfer?.response?.data?.id ||
    response.body?.transfer?.response?.id ||
    response.body?.transfer?.request?.idempotencyKey ||
    "circle-transfer";
  return { txId, receipt: response.body };
}

async function sendX402Payment(amountMinor, memo, intent = "") {
  const response = await request("/api/payments/x402/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount_minor: Number(amountMinor || 0),
      memo: String(memo || ""),
      intent: String(intent || ""),
      metadata: {
        source: "ui",
        at: new Date().toISOString()
      }
    })
  });
  if (!response.ok) {
    throw new Error(response.body?.error?.message || "x402 payment authorization failed");
  }
  return {
    txId: response.body?.payment_ref || null,
    receipt: response.body
  };
}

async function resolvePaymentReference(mode, amountMinor, memo, intent = "") {
  if (mode === "offchain_demo") {
    return { mode, ref: null, receipt: null };
  }
  if (mode === "metamask") {
    const txHash = await sendMetaMaskPayment(amountMinor);
    return { mode, ref: txHash, receipt: { tx_hash: txHash } };
  }
  if (mode === "circle_wallet") {
    const circle = await sendCirclePayment(amountMinor, memo);
    return { mode, ref: circle.txId, receipt: circle.receipt };
  }
  if (mode === "x402") {
    const x402 = await sendX402Payment(amountMinor, memo, intent);
    return { mode, ref: x402.txId, receipt: x402.receipt };
  }
  throw new Error(`Unsupported payment mode: ${mode}`);
}

async function refreshLeaderboard() {
  const data = await request("/api/tips/leaderboard");
  print("leaderboard", data.body);
}

async function loadConfig() {
  const data = await request("/api/config");
  railConfig = data.body;
  print("rail-config", railConfig);
}

async function loadAisaX402ConfigFromUi() {
  const response = await request("/api/config");
  const x402 = response.body?.rails?.x402 || null;
  print("aisa-x402-output", {
    route: "/api/config",
    ok: response.ok,
    status: response.status,
    x402
  });
}

async function authorizeAisaX402FromUi() {
  const amountMinor = Number(document.getElementById("aisa-x402-amount")?.value || 0);
  const intent = document.getElementById("aisa-x402-intent")?.value?.trim() || "";
  const memo = document.getElementById("aisa-x402-memo")?.value?.trim() || "aisa-x402-demo";
  const mode = document.getElementById("aisa-x402-mode")?.value || "x402_probe";
  const targetPath =
    document.getElementById("aisa-x402-target-path")?.value?.trim() || "/apis/v2/twitter/user/info?userName=jack";
  const response = await request("/api/payments/x402/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount_minor: amountMinor,
      intent,
      memo,
      mode,
      target_path: targetPath,
      session_hint: "hackathon-pitch-demo",
      metadata: {
        source: "aisa-demo-panel",
        at: new Date().toISOString()
      }
    })
  });
  print("aisa-x402-output", {
    route: "/api/payments/x402/authorize",
    ok: response.ok,
    status: response.status,
    request: {
      amount_minor: amountMinor,
      intent,
      memo,
      mode,
      target_path: targetPath
    },
    body: response.body
  });
}

async function runAisaLlmFromUi() {
  const mode = document.getElementById("aisa-llm-mode")?.value || "api_key_proxy";
  const model = document.getElementById("aisa-llm-model")?.value || "gpt-5.3-codex";
  const capability = document.getElementById("aisa-llm-capability")?.value || "text";
  const endpointPath = document.getElementById("aisa-llm-endpoint")?.value?.trim() || "/v1/chat/completions";
  const replayRequested = Boolean(document.getElementById("aisa-llm-replay-requested")?.checked);
  const replayHeadersText = document.getElementById("aisa-llm-replay-headers")?.value?.trim() || "";
  let replayHeaders = null;
  if (replayHeadersText) {
    try {
      replayHeaders = JSON.parse(replayHeadersText);
    } catch (_error) {
      print("aisa-llm-output", {
        route: "/api/aisa/llm/chat",
        ok: false,
        status: 0,
        error: "Replay headers must be valid JSON."
      });
      return;
    }
  }
  const temperature = Number(document.getElementById("aisa-llm-temperature")?.value || 0.2);
  const maxTokens = Number(document.getElementById("aisa-llm-max-tokens")?.value || 256);
  const systemPrompt = document.getElementById("aisa-llm-system")?.value?.trim() || "";
  const userPrompt = document.getElementById("aisa-llm-user")?.value?.trim() || "";
  const startedAt = Date.now();
  const response = await request("/api/aisa/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      model,
      capability,
      endpoint_path: endpointPath,
      replay_requested: replayRequested,
      replay_headers: replayHeaders,
      temperature,
      max_tokens: maxTokens,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: userPrompt }
      ]
    })
  });
  const elapsedMs = Date.now() - startedAt;
  print("aisa-llm-output", {
    route: "/api/aisa/llm/chat",
    ok: response.ok,
    status: response.status,
    request: {
      mode,
      model,
      capability,
      endpoint_path: endpointPath,
      replay_requested: replayRequested,
      replay_headers_supplied: Boolean(replayHeaders),
      temperature,
      max_tokens: maxTokens,
      user_prompt: userPrompt
    },
    body: response.body
  });
}

function refreshAisaLlmModelOptions() {
  const capability = document.getElementById("aisa-llm-capability")?.value || "text";
  const modelSelect = document.getElementById("aisa-llm-model");
  const endpointInput = document.getElementById("aisa-llm-endpoint");
  if (!modelSelect || !endpointInput) {
    return;
  }
  const previous = modelSelect.value;
  const filtered = AISA_LLM_MODEL_CATALOG.filter((entry) => entry.capabilities.includes(capability));
  const candidates = filtered.length > 0 ? filtered : AISA_LLM_MODEL_CATALOG;
  modelSelect.innerHTML = "";
  candidates.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.id;
    modelSelect.appendChild(option);
  });
  if (candidates.some((entry) => entry.id === previous)) {
    modelSelect.value = previous;
  }
  const selected = candidates.find((entry) => entry.id === modelSelect.value) || candidates[0];
  endpointInput.value = selected?.endpoint || "/v1/chat/completions";
}

function syncAisaLlmEndpointToModel() {
  const model = document.getElementById("aisa-llm-model")?.value || "";
  const mode = document.getElementById("aisa-llm-mode")?.value || "api_key_proxy";
  const endpointInput = document.getElementById("aisa-llm-endpoint");
  if (!endpointInput) {
    return;
  }
  if (mode === "x402_probe") {
    if (!String(endpointInput.value || "").trim().startsWith("/apis/v2/")) {
      endpointInput.value = "/apis/v2/perplexity/sonar";
    }
    return;
  }
  if (mode === "x402_external_settle") {
    if (!String(endpointInput.value || "").trim().startsWith("/apis/v2/")) {
      endpointInput.value = "/apis/v2/perplexity/sonar";
    }
    return;
  }
  const selected = AISA_LLM_MODEL_CATALOG.find((entry) => entry.id === model);
  if (selected?.endpoint) {
    endpointInput.value = selected.endpoint;
  }
}

async function createCircleWalletFromUi() {
  const payload = {
    wallet_name: document.getElementById("circle-wallet-name").value || "",
    blockchain: document.getElementById("circle-blockchain").value || "ARC-TESTNET",
    wallet_set_id: document.getElementById("circle-wallet-set-id").value || "",
    entity_secret_ciphertext: document.getElementById("circle-entity-ciphertext").value || "",
    entity_secret_raw: document.getElementById("circle-entity-secret-raw").value || ""
  };
  const response = await request("/api/circle/wallets/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(response.body?.error?.message || "Failed to create Circle wallet");
  }
  print("circle-wallet-output", response.body);
  lastCreatedCircleWallet = extractCircleWalletDetails(response.body);
  renderCircleFundingCue(lastCreatedCircleWallet);
  if (lastCreatedCircleWallet) {
    setCircleSaveStatus("Wallet created. Save wallet details for quick reuse.");
  }
  await loadConfig();
}

async function saveCircleWalletFromUi() {
  const hasOutputWallet = Boolean(getWalletDetailsFromOutputPane());
  const details = lastCreatedCircleWallet || getWalletDetailsFromOutputPane();
  if (!details) {
    setCircleSaveStatus("No wallet found. Create a Circle wallet first.");
    return;
  }
  localStorage.setItem("circleWalletDetails", JSON.stringify(details));
  setCircleSaveStatus("Circle wallet details saved locally.");
  renderCircleFundingCue(details);
}

function hydrateSavedCircleWallet() {
  try {
    const saved = localStorage.getItem("circleWalletDetails");
    if (!saved) {
      renderCircleFundingCue(null);
      return;
    }
    const parsed = JSON.parse(saved);
    if (parsed?.walletId && parsed?.walletAddress) {
      lastCreatedCircleWallet = parsed;
      setCircleSaveStatus("Loaded saved Circle wallet details from this browser.");
      renderCircleFundingCue(parsed);
      return;
    }
    renderCircleFundingCue(null);
  } catch (_error) {
    renderCircleFundingCue(null);
  }
}

async function generateCiphertextFromUi() {
  const payload = {
    entity_secret_raw: document.getElementById("circle-entity-secret-raw").value || ""
  };
  const response = await request("/api/circle/entity-secret-ciphertext/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(response.body?.error?.message || "Failed to generate ciphertext");
  }
  const value = response.body?.entity_secret_ciphertext || "";
  document.getElementById("circle-entity-ciphertext").value = value;
  print("circle-wallet-output", {
    generated: true,
    ciphertext_preview: value ? `${value.slice(0, 12)}...${value.slice(-12)}` : null
  });
}

async function loadTutorials() {
  const data = await request("/api/tutorials");
  const select = document.getElementById("clip-id");
  select.innerHTML = "";
  data.body.tutorials.forEach((clip) => {
    const option = document.createElement("option");
    option.value = clip.id;
    option.textContent = `${clip.title} ($${clip.price_usd})`;
    select.appendChild(option);
  });
}

async function refreshBattle() {
  const data = await request("/api/battle");
  print("battle-output", data.body);
  const winnerSelect = document.getElementById("winner-id");
  winnerSelect.innerHTML = "";
  data.body.entrants.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = `${entry.dancer_name} (${entry.id})`;
    winnerSelect.appendChild(option);
  });
}

document.getElementById("tip-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const amountMinor = Number(document.getElementById("tip-amount").value);
    const mode = document.getElementById("tip-mode").value;
    const execution = getExecutionSelection("tip-execution-mode", "tip-execution-network");
    const payment = await resolvePaymentReference(mode, amountMinor, "u1-tip");
    const payload = {
      fan_name: document.getElementById("fan-name").value || "Anonymous",
      dancer_id: document.getElementById("dancer-id").value,
      amount_minor: amountMinor,
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    print("leaderboard", { payment_receipt: payment.receipt, app_response: data.body });
    await refreshLeaderboard();
  } catch (error) {
    print("leaderboard", { error: error.message });
  }
});

document.getElementById("try-locked").addEventListener("click", async () => {
  const clipId = document.getElementById("clip-id").value;
  const data = await request(`/api/tutorials/${clipId}`);
  print("tutorial-output", { status: data.status, body: data.body });
});

document.getElementById("pay-unlock").addEventListener("click", async () => {
  try {
    const clipId = document.getElementById("clip-id").value;
    const clipData = await request("/api/tutorials");
    const clip = (clipData.body?.tutorials || []).find((item) => item.id === clipId);
    if (!clip) {
      throw new Error("Tutorial clip not found");
    }
    const mode = document.getElementById("tutorial-mode").value;
    const execution = getExecutionSelection("tutorial-execution-mode", "tutorial-execution-network");
    const payment = await resolvePaymentReference(mode, Number(clip.priceMinor), "u2-unlock");
    const data = await request(`/api/tutorials/${clipId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: "Hackathon Demo Buyer",
        payment_mode: payment.mode,
        payment_ref: payment.ref,
        execution_mode: execution.execution_mode,
        execution_network: execution.execution_network
      })
    });
    unlockToken = data.body.unlock_token || "";
    print("tutorial-output", {
      status: data.status,
      unlockToken,
      payment_receipt: payment.receipt,
      body: data.body
    });
  } catch (error) {
    print("tutorial-output", { error: error.message });
  }
});

document.getElementById("open-unlocked").addEventListener("click", async () => {
  const clipId = document.getElementById("clip-id").value;
  const data = await request(`/api/tutorials/${clipId}?unlock_token=${encodeURIComponent(unlockToken)}`);
  print("tutorial-output", { status: data.status, body: data.body });
});

document.getElementById("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const amountMinor = Number(document.getElementById("entry-fee").value);
    const mode = document.getElementById("battle-mode").value;
    const execution = getExecutionSelection("battle-execution-mode", "battle-execution-network");
    const payment = await resolvePaymentReference(mode, amountMinor, "u5-entry");
    const payload = {
      dancer_name: document.getElementById("entry-name").value,
      wallet: document.getElementById("entry-wallet").value,
      entry_fee_minor: amountMinor,
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request("/api/battle/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    print("battle-output", {
      status: data.status,
      payment_receipt: payment.receipt,
      body: data.body
    });
    await refreshBattle();
  } catch (error) {
    print("battle-output", { error: error.message });
  }
});

document.getElementById("close-battle").addEventListener("click", async () => {
  const data = await request("/api/battle/close", { method: "POST" });
  print("battle-output", { status: data.status, body: data.body });
  await refreshBattle();
});

document.getElementById("payout-winner").addEventListener("click", async () => {
  const winner_entry_id = document.getElementById("winner-id").value;
  const execute_via_keeperhub = document.getElementById("keeperhub-on-payout").checked;
  const data = await request("/api/battle/declare-winner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ winner_entry_id, execute_via_keeperhub })
  });
  print("battle-output", { status: data.status, body: data.body });
  await refreshBattle();
});

document.getElementById("connect-metamask").addEventListener("click", async () => {
  try {
    await connectMetaMask();
  } catch (error) {
    document.getElementById("wallet-status").textContent = `Wallet error: ${error.message}`;
  }
});

document.getElementById("create-circle-wallet").addEventListener("click", async () => {
  try {
    await createCircleWalletFromUi();
  } catch (error) {
    print("circle-wallet-output", { error: error.message });
  }
});

document.getElementById("generate-ciphertext").addEventListener("click", async () => {
  try {
    const raw = document.getElementById("circle-entity-secret-raw").value || "";
    if (!raw) {
      print("circle-wallet-output", {
        info: "Raw entity secret field is empty. The server will try CIRCLE_ENTITY_SECRET_RAW or CIRCLE_ENTITY_SECRET from .env."
      });
    }
    await generateCiphertextFromUi();
  } catch (error) {
    print("circle-wallet-output", { error: error.message });
  }
});

document.getElementById("save-circle-wallet").addEventListener("click", async () => {
  await saveCircleWalletFromUi();
});

document.getElementById("refresh-balances").addEventListener("click", async () => {
  await refreshBalances();
});

document.getElementById("ucp-load-discovery").addEventListener("click", async () => {
  await loadUcpDiscoveryFromUi();
});

document.getElementById("ucp-run-self-test").addEventListener("click", async () => {
  await runUcpSelfTestFromUi();
});

document.getElementById("ucp-run-sample-checkout").addEventListener("click", async () => {
  await runUcpSampleCheckoutFromUi();
});

document.getElementById("aisa-x402-load-config")?.addEventListener("click", async () => {
  try {
    await loadAisaX402ConfigFromUi();
  } catch (error) {
    print("aisa-x402-output", { error: error.message });
  }
});

document.getElementById("aisa-x402-authorize")?.addEventListener("click", async () => {
  try {
    await authorizeAisaX402FromUi();
  } catch (error) {
    print("aisa-x402-output", { error: error.message });
  }
});

document.getElementById("aisa-llm-run")?.addEventListener("click", async () => {
  try {
    await runAisaLlmFromUi();
  } catch (error) {
    print("aisa-llm-output", { error: error.message });
  }
});
document.getElementById("aisa-llm-capability")?.addEventListener("change", () => {
  refreshAisaLlmModelOptions();
});
document.getElementById("aisa-llm-model")?.addEventListener("change", () => {
  syncAisaLlmEndpointToModel();
});
document.getElementById("aisa-llm-mode")?.addEventListener("change", () => {
  syncAisaLlmEndpointToModel();
});

document.getElementById("agent-load-capabilities").addEventListener("click", async () => {
  await loadAgentCapabilitiesFromUi();
});
document.getElementById("agent-load-identity").addEventListener("click", async () => {
  await loadAgentIdentityFromUi();
});

document.getElementById("agent-run-session").addEventListener("click", async () => {
  try {
    await runAgentSessionFromUi();
  } catch (error) {
    print("agent-output", { error: error.message });
  }
});

document.getElementById("ens-preset-nine-intents")?.addEventListener("click", () => {
  applyEnsJudgeNineIntentCsvFromUi();
});

document.getElementById("ens-reset-name-new-judge")?.addEventListener("click", () => {
  resetEnsJudgeNameDraftFromUi();
});

document.getElementById("agent-run-marathon")?.addEventListener("click", async () => {
  try {
    await runNineIntentMarathonDemoFromUi();
  } catch (error) {
    print("agent-marathon-output", { error: error?.message || String(error) });
  }
});

document.getElementById("ens-resolve-identity")?.addEventListener("click", async () => {
  try {
    debugEnsLog("H5", "public/main.js:ens-resolve-identity:click", "resolve button event fired", {});
    await resolveEnsJudgeIdentityForUi();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ens-register-update")?.addEventListener("click", async () => {
  try {
    debugEnsLog("H5", "public/main.js:ens-register-update:click", "register button event fired", {});
    await registerUpdateEnsJudgeIdentityForUi();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ens-check-signer-balance")?.addEventListener("click", async () => {
  try {
    await checkEnsSignerBalanceFromUi();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-signer-balance-chip",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ens-check-name-status")?.addEventListener("click", async () => {
  try {
    await checkEnsNameStatusFromUi();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-name-status-chip",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ens-run-guided-flow")?.addEventListener("click", async () => {
  try {
    await runEnsip25GuidedFlowFromUi();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ethglobal-hackathon-run-demo")?.addEventListener("click", async () => {
  try {
    await runEthglobalHackathonDemoFromUi();
  } catch (error) {
    print("ethglobal-hackathon-output", {
      hackathon_demo: true,
      ok: false,
      error: error?.message || String(error)
    });
  }
});

document.getElementById("ethglobal-hackathon-fill-winner-mm")?.addEventListener("click", async () => {
  try {
    await connectMetaMask();
    const input = document.getElementById("ethglobal-demo-winner-wallet");
    if (input && connectedAccount) {
      input.value = connectedAccount;
    }
  } catch (error) {
    print("ethglobal-hackathon-output", {
      hackathon_demo: true,
      ok: false,
      fill_winner_error: error?.message || String(error)
    });
  }
});

document.getElementById("ens-registry-upsert")?.addEventListener("click", async () => {
  try {
    await upsertRegistryLinkFromUi();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ens-verify-attestation")?.addEventListener("click", async () => {
  try {
    await verifyEnsAttestationFromUi();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-trust-chip",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ens-fill-arc-actor")?.addEventListener("click", async () => {
  try {
    await fillEnsArcActorAddressFromSelectedSource();
  } catch (error) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: error?.message || String(error),
      variant: "warning"
    });
  }
});

document.getElementById("ens-write-mode")?.addEventListener("change", async (event) => {
  const mode = event?.target?.value || "demo";
  if (mode !== "circle_wallet") {
    setEnsJudgeChip({ statusId: "ens-signer-balance-chip", chipText: "", variant: null });
    return;
  }
  try {
    await checkEnsSignerBalanceFromUi();
  } catch (_error) {
    // no-op; handled inside helper
  }
});

document.getElementById("ens-name-input")?.addEventListener("input", (event) => {
  const value = event?.target?.value || "";
  const globalInput = document.getElementById("agent-ens-name");
  if (globalInput) {
    globalInput.value = value;
  }
  maybeAutoFillAgentIdFromEnsName();
});

document.getElementById("ens-name-input")?.addEventListener("blur", (event) => {
  const normalized = normalizeEnsNameInput(event?.target?.value || "");
  if (!normalized) {
    return;
  }
  const ensInput = document.getElementById("ens-name-input");
  const globalInput = document.getElementById("agent-ens-name");
  if (ensInput) {
    ensInput.value = normalized;
  }
  if (globalInput) {
    globalInput.value = normalized;
  }
  maybeAutoFillAgentIdFromEnsName();
});

document.getElementById("ens-name-input")?.addEventListener("change", async () => {
  maybeAutoFillAgentIdFromEnsName();
  try {
    await checkEnsNameStatusFromUi();
  } catch (_error) {
    // no-op; status handled in helper
  }
});

document.getElementById("agent-intent")?.addEventListener("change", () => {
  updateAgentRunDisabledByEnsGating();
  // Optionally refresh gating if ENS resolve already ran.
  if (lastEnsJudgeResolve) {
    const selectedIntent = document.getElementById("agent-intent")?.value || "";
    if (!selectedIntent) {
      setEnsJudgeChip({ statusId: "ens-gating-chip", chipText: "", variant: null });
      return;
    }
    const allowedIntents = Array.isArray(lastEnsJudgeResolve.allowed_intents)
      ? lastEnsJudgeResolve.allowed_intents
      : [];
    const hasAllowedIntents = allowedIntents.length > 0;
    const isAllowed = hasAllowedIntents ? allowedIntents.includes(selectedIntent) : true;
    if (isAllowed) {
      setEnsJudgeChip({
        statusId: "ens-gating-chip",
        chipText: `Selected intent "${selectedIntent}" allowed by ENS.`,
        variant: "success"
      });
    } else {
      setEnsJudgeChip({
        statusId: "ens-gating-chip",
        chipText: `Selected intent "${selectedIntent}" blocked by ENS allowedIntents.`,
        variant: "warning"
      });
    }
  }
});

document.getElementById("agent-get-last-session").addEventListener("click", async () => {
  await getLastAgentSessionFromUi();
});

document.getElementById("settlement-evaluate").addEventListener("click", async () => {
  await evaluateSettlementFromUi();
});

async function loadKeeperHubStatusFromUi() {
  const data = await request("/api/keeperhub/status");
  renderKeeperhubLocalDebugHint(data.body || {});
  print("keeperhub-output", { status: data.status, body: data.body });
}

async function loadKeeperHubChainsFromUi() {
  const data = await request("/api/keeperhub/chains?includeDisabled=true");
  print("keeperhub-output", { status: data.status, body: data.body });
}

function setKeeperhubOnlineSourceWalletAddress(address) {
  const input = document.getElementById("keeperhub-online-source-wallet");
  if (input) {
    input.value = address || "";
  }
}

function setKeeperhubDestinationGasWalletAddress(address) {
  const input = document.getElementById("keeperhub-destination-gas-wallet");
  if (input) {
    input.value = address || "";
  }
}

function updateKeeperhubChainHint() {
  const target = document.getElementById("keeperhub-chain-hint");
  const executionMode = document.getElementById("keeperhub-execution-mode")?.value || "local";
  const network = document.getElementById("keeperhub-execution-network")?.value || "base-sepolia";
  const networkSelect = document.getElementById("keeperhub-execution-network");
  const destinationGasButton = document.getElementById("keeperhub-fund-destination-gas");
  const localDedicated = document.getElementById("keeperhub-local-dedicated");
  const onlineDedicated = document.getElementById("keeperhub-online-dedicated");
  const chainMap = {
    "base-sepolia": "BASE-SEPOLIA",
    "ethereum-sepolia": "ETH-SEPOLIA",
    "polygon-amoy": "MATIC-AMOY",
    "arbitrum-sepolia": "ARB-SEPOLIA",
    "avalanche-fuji": "AVAX-FUJI"
  };
  const nativeSymbolByNetwork = {
    "base-sepolia": "ETH",
    "ethereum-sepolia": "ETH",
    "polygon-amoy": "POL",
    "arbitrum-sepolia": "ETH",
    "avalanche-fuji": "AVAX"
  };
  const destinationChain = chainMap[network] || String(network || "").toUpperCase();
  const isLocalMode = executionMode === "local";
  if (localDedicated && onlineDedicated) {
    if (isLocalMode) {
      localDedicated.classList.remove("hidden");
      onlineDedicated.classList.add("hidden");
    } else {
      localDedicated.classList.add("hidden");
      onlineDedicated.classList.remove("hidden");
    }
  }
  if (networkSelect) {
    networkSelect.disabled = isLocalMode;
  }
  if (destinationGasButton) {
    destinationGasButton.disabled = isLocalMode;
  }
  if (target) {
    if (isLocalMode) {
      target.textContent =
        "Local execution path: source + destination are ARC-TESTNET. No CCTP bridge or destination-chain gas wallet is required.";
    } else {
      target.textContent = `Source wallet blockchain: ARC-TESTNET (USDC). Destination gas wallet blockchain: ${destinationChain} (native gas token).`;
    }
  }
  const reminder = document.getElementById("keeperhub-funding-reminder");
  if (reminder) {
    const sel = networkSelect;
    const label =
      sel?.options?.[sel.selectedIndex]?.text?.trim() || destinationChain.replace(/-/g, " ");
    const native = nativeSymbolByNetwork[network] || "that chain's native token";
    if (isLocalMode) {
      reminder.textContent =
        "KeeperHub local (Arc) mode: use ARC-TESTNET flow only. Fund ARC source USDC as needed; CCTP and destination-chain gas funding are online-mode only.";
    } else {
      reminder.textContent = `Top up KeeperHub wallets used for online execution on ${label} with USDC and ${native} (native gas on the network you select below).`;
    }
  }
}

function renderKeeperhubLocalDebugHint(status = null) {
  const target = document.getElementById("keeperhub-local-debug");
  if (!target) return;
  const configured = status && typeof status.configured === "boolean" ? status.configured : null;
  const arcSupported = status && typeof status.arc_supported === "boolean" ? status.arc_supported : null;
  const apiBase = status?.api_base || "unknown";
  let text =
    "KeeperHub Local + Arc Testnet quick start: use execution mode KeeperHub local (Arc). " +
    "This local path stays on ARC-TESTNET and does not require CCTP or destination-chain gas funding. " +
    "Start local dependencies first (for local KeeperHub repo, run Docker stack), then run Load KeeperHub Status.";
  if (configured === false) {
    text =
      "KeeperHub Local + Arc Testnet debug: KeeperHub is not configured from this app. Set a valid KeeperHub org API key and API base, " +
      "then re-run Load KeeperHub Status.";
  } else if (configured === true && arcSupported === false) {
    text =
      `KeeperHub Local + Arc Testnet debug: KeeperHub responds (configured=true, api_base=${apiBase}) but Arc is not listed in chains. ` +
      "This usually means instance/network mismatch, not a UI bug. Check local KeeperHub chain config and Docker-backed services.";
  } else if (configured === true && arcSupported === true) {
    text =
      `KeeperHub Local + Arc Testnet debug: KeeperHub is ready (configured=true, api_base=${apiBase}, arc_supported=true). ` +
      "You can continue with local transfer tests on ARC-TESTNET without CCTP.";
  }
  target.textContent = text;
}

function setKeeperhubDestinationBalanceHint({ nativeBalance, nativeSymbol, usdcBalance, destinationChain }) {
  const target = document.getElementById("keeperhub-destination-balance-hint");
  if (!target) {
    return;
  }
  const resolvedNative = nativeBalance || "0";
  const resolvedSymbol = nativeSymbol || "ETH";
  const resolvedUsdc = typeof usdcBalance === "number" ? usdcBalance.toString() : usdcBalance || "0";
  const resolvedChain = destinationChain || "BASE-SEPOLIA";
  target.textContent = `Destination signer balances on ${resolvedChain}: ${resolvedNative} ${resolvedSymbol}, ${resolvedUsdc} USDC.`;
}

function setKeeperhubSignerSourceHint({ signerSource, destinationChain, signerMatchesSourceWallet }) {
  const target = document.getElementById("keeperhub-signer-source-hint");
  if (!target) {
    return;
  }
  const resolvedChain = destinationChain || "BASE-SEPOLIA";
  if (signerSource === "destination_wallet") {
    if (signerMatchesSourceWallet) {
      target.textContent =
        `Destination signer source on ${resolvedChain}: destination-chain Circle wallet. Address matches ARC source ` +
        `(expected with unified EVM wallet addressing).`;
      return;
    }
    target.textContent =
      `Destination signer source on ${resolvedChain}: destination-chain Circle wallet. ` +
      `Address is distinct from ARC source.`;
    return;
  }
  if (signerSource === "source_wallet_fallback") {
    target.textContent =
      `Destination signer source on ${resolvedChain}: source wallet fallback. ` +
      `Address matches ARC source because no destination-chain wallet was found.`;
    return;
  }
  target.textContent = `Destination signer source on ${resolvedChain}: unknown.`;
}

function setKeeperhubSignerFallbackWarning({ signerSource, destinationChain }) {
  const target = document.getElementById("keeperhub-signer-warning");
  if (!target) {
    return;
  }
  if (signerSource !== "source_wallet_fallback") {
    target.classList.add("hidden");
    target.classList.remove("warning");
    target.textContent = "";
    return;
  }
  const resolvedChain = destinationChain || "BASE-SEPOLIA";
  target.classList.remove("hidden");
  target.classList.add("warning");
  target.textContent = `No Circle wallet found on ${resolvedChain}. Using ARC source wallet address as temporary signer fallback.`;
}

function setKeeperhubSignerWalletIdHint({ destinationNetwork, destinationChain, signerWalletId, signerSource }) {
  const target = document.getElementById("keeperhub-signer-wallet-id-hint");
  if (!target) {
    return;
  }
  const expectedWalletIds = {
    "arbitrum-sepolia": "dc2f5925-5047-50d9-bbbc-15d8d219eba8",
    "polygon-amoy": "386cfa97-2e87-59d3-87bc-e769dc6a5c22"
  };
  const networkKey = String(destinationNetwork || "").trim().toLowerCase();
  const chain = destinationChain || "UNKNOWN";
  const walletId = signerWalletId || "none";
  const expected = expectedWalletIds[networkKey] || "";
  if (!expected) {
    target.textContent = `Destination signer wallet id on ${chain}: ${walletId}.`;
    return;
  }
  if (signerSource !== "destination_wallet") {
    target.textContent =
      `Destination signer wallet id on ${chain}: ${walletId}. Expected for ${chain}: ${expected} ` +
      `(not active because signer source is fallback).`;
    return;
  }
  const matches = walletId === expected;
  target.textContent =
    `Destination signer wallet id on ${chain}: ${walletId}. Expected for ${chain}: ${expected}. ` +
    `Match: ${matches ? "yes" : "no"}.`;
}

function setKeeperhubDestinationGasReadinessHint({ nativeBalance, nativeSymbol, minRecommended, isSufficient, keeperhubExecutorHint }) {
  const target = document.getElementById("keeperhub-gas-warning");
  if (!target) {
    return;
  }
  if (typeof isSufficient !== "boolean") {
    target.classList.add("hidden");
    target.classList.remove("warning", "success");
    return;
  }
  const executor =
    typeof keeperhubExecutorHint === "string" && keeperhubExecutorHint.trim()
      ? ` ${keeperhubExecutorHint.trim()}`
      : "";
  if (!isSufficient) {
    target.classList.remove("hidden", "success");
    target.classList.add("warning");
    target.textContent = `Action needed: Circle bridge signer gas is low (${nativeBalance || "0"} ${nativeSymbol || "ETH"}). Recommended >= ${minRecommended || 0}.${executor}`;
    return;
  }
  target.classList.remove("hidden", "warning");
  target.classList.add("success");
  target.textContent = `Circle bridge signer has enough native gas (${nativeBalance || "0"} ${nativeSymbol || "ETH"}) for CCTP.${executor}`;
}

function setKeeperhubSourceBalanceHint({ usdcBalance }) {
  const target = document.getElementById("keeperhub-source-balance-hint");
  if (!target) {
    return;
  }
  const resolvedUsdc = typeof usdcBalance === "number" ? usdcBalance.toString() : usdcBalance || "0";
  target.textContent = `Source wallet balance on ARC-TESTNET: ${resolvedUsdc} USDC.`;
}

async function fundKeeperhubOnlineSourceFromUi({ openFaucet = true } = {}) {
  const data = await request("/api/keeperhub/online-source-wallet/fund-hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const walletAddress = data.body?.wallet_address || "";
  setKeeperhubOnlineSourceWalletAddress(walletAddress);
  setKeeperhubSourceBalanceHint({
    usdcBalance: data.body?.source_usdc_balance ?? 0
  });
  let copied = false;
  if (walletAddress && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(walletAddress);
      copied = true;
    } catch (_err) {}
  }
  const faucetUrl = data.body?.faucet_url || "https://faucet.circle.com/";
  if (openFaucet && faucetUrl) {
    window.open(faucetUrl, "_blank", "noopener,noreferrer");
  }
  print("keeperhub-output", {
    status: data.status,
    copied_wallet_address: copied,
    body: data.body
  });
}

async function fundKeeperhubDestinationGasFromUi({ openFaucet = true } = {}) {
  const executionMode = document.getElementById("keeperhub-execution-mode")?.value || "local";
  if (executionMode === "local") {
    print("keeperhub-output", {
      info:
        "KeeperHub local (Arc) mode selected: destination gas funding is skipped because CCTP/destination-chain execution is online-only."
    });
    return;
  }
  const executionNetwork = document.getElementById("keeperhub-execution-network")?.value || "base-sepolia";
  const data = await request("/api/keeperhub/online-destination-gas/fund-hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ execution_network: executionNetwork })
  });
  const walletAddress = data.body?.signer_address || "";
  setKeeperhubDestinationGasWalletAddress(walletAddress);
  setKeeperhubDestinationBalanceHint({
    nativeBalance: data.body?.signer_native_balance || "0",
    nativeSymbol: data.body?.native_symbol || "ETH",
    usdcBalance: data.body?.signer_usdc_balance ?? 0,
    destinationChain: data.body?.destination_chain || "BASE-SEPOLIA"
  });
  setKeeperhubSignerSourceHint({
    signerSource: data.body?.signer_source || "",
    destinationChain: data.body?.destination_chain || "BASE-SEPOLIA",
    signerMatchesSourceWallet: Boolean(data.body?.signer_matches_source_wallet)
  });
  setKeeperhubSignerFallbackWarning({
    signerSource: data.body?.signer_source || "",
    destinationChain: data.body?.destination_chain || "BASE-SEPOLIA"
  });
  setKeeperhubSignerWalletIdHint({
    destinationNetwork: data.body?.destination_network || executionNetwork,
    destinationChain: data.body?.destination_chain || "BASE-SEPOLIA",
    signerWalletId: data.body?.signer_wallet_id || "",
    signerSource: data.body?.signer_source || ""
  });
  setKeeperhubDestinationGasReadinessHint({
    nativeBalance: data.body?.signer_native_balance || "0",
    nativeSymbol: data.body?.native_symbol || "ETH",
    minRecommended: data.body?.signer_native_min_recommended ?? 0,
    isSufficient: Boolean(data.body?.signer_native_is_sufficient),
    keeperhubExecutorHint: data.body?.keeperhub_executor_gas_hint_short || data.body?.keeperhub_executor_gas_hint || ""
  });
  let copied = false;
  if (walletAddress && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(walletAddress);
      copied = true;
    } catch (_err) {}
  }
  const faucetUrl = data.body?.faucet_url || "";
  if (openFaucet && faucetUrl) {
    window.open(faucetUrl, "_blank", "noopener,noreferrer");
  }
  print("keeperhub-output", {
    status: data.status,
    copied_wallet_address: copied,
    body: data.body
  });
}

async function refreshKeeperhubBalancesFromUi() {
  updateKeeperhubChainHint();
  await fundKeeperhubOnlineSourceFromUi({ openFaucet: false });
  const executionMode = document.getElementById("keeperhub-execution-mode")?.value || "local";
  if (executionMode === "online") {
    await fundKeeperhubDestinationGasFromUi({ openFaucet: false });
  } else {
    print("keeperhub-output", {
      info:
        "KeeperHub local (Arc) mode selected: refreshed ARC source balance only. Destination gas checks are online-only."
    });
  }
}

async function keeperHubDemoTransferFromUi() {
  const recipient_address = document.getElementById("keeperhub-demo-recipient").value.trim();
  const amount_minor = Number(document.getElementById("keeperhub-demo-amount").value);
  const mode = document.getElementById("keeperhub-demo-mode").value || "offchain_demo";
  const execution = getExecutionSelection("keeperhub-execution-mode", "keeperhub-execution-network");
  const payment = await resolvePaymentReference(mode, amount_minor, "keeperhub-demo");
  const data = await request("/api/keeperhub/execute-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient_address,
      amount_minor,
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      ...execution
    })
  });
  print("keeperhub-output", { status: data.status, payment_receipt: payment.receipt, body: data.body });
}

document.getElementById("keeperhub-load-status").addEventListener("click", async () => {
  try {
    await loadKeeperHubStatusFromUi();
  } catch (error) {
    print("keeperhub-output", { error: error.message });
  }
});

document.getElementById("keeperhub-load-chains").addEventListener("click", async () => {
  try {
    await loadKeeperHubChainsFromUi();
  } catch (error) {
    print("keeperhub-output", { error: error.message });
  }
});

document.getElementById("keeperhub-refresh-balances").addEventListener("click", async () => {
  try {
    await refreshKeeperhubBalancesFromUi();
  } catch (error) {
    print("keeperhub-output", { error: error.message });
  }
});

document.getElementById("keeperhub-fund-online-source").addEventListener("click", async () => {
  try {
    await fundKeeperhubOnlineSourceFromUi({ openFaucet: true });
  } catch (error) {
    print("keeperhub-output", { error: error.message });
  }
});

document.getElementById("keeperhub-fund-destination-gas").addEventListener("click", async () => {
  try {
    await fundKeeperhubDestinationGasFromUi({ openFaucet: true });
  } catch (error) {
    print("keeperhub-output", { error: error.message });
  }
});

document.getElementById("keeperhub-demo-transfer").addEventListener("click", async () => {
  try {
    await keeperHubDemoTransferFromUi();
  } catch (error) {
    print("keeperhub-output", { error: error.message });
  }
});

document.getElementById("keeperhub-execution-network").addEventListener("change", () => {
  updateKeeperhubChainHint();
  fundKeeperhubDestinationGasFromUi({ openFaucet: false }).catch(() => {});
});

document.getElementById("keeperhub-execution-mode").addEventListener("change", () => {
  updateKeeperhubChainHint();
});

// U3
document.getElementById("u3-list-feedback").addEventListener("click", async () => {
  const data = await request("/api/judge-feedback");
  print("u3-output", { status: data.status, body: data.body });
});

document.getElementById("u3-request-feedback").addEventListener("click", async () => {
  try {
    const amountMinor = Number(document.getElementById("u3-amount").value || 0);
    const mode = document.getElementById("u3-mode").value;
    const execution = getExecutionSelection("u3-execution-mode", "u3-execution-network");
    const payment = await resolvePaymentReference(mode, amountMinor, "u3-feedback");
    const payload = {
      dancer_name: document.getElementById("u3-dancer-name").value || "Guest Dancer",
      judge_name: document.getElementById("u3-judge-name").value || "Judge X",
      topic: document.getElementById("u3-topic").value || "Battle breakdown",
      amount_minor: amountMinor,
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request("/api/judge-feedback/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    print("u3-output", { status: data.status, payment_receipt: payment.receipt, body: data.body });
  } catch (error) {
    print("u3-output", { error: error.message });
  }
});

document.getElementById("u3-deliver-feedback").addEventListener("click", async () => {
  const requestId = document.getElementById("u3-request-id").value;
  const data = await request(`/api/judge-feedback/${encodeURIComponent(requestId)}/deliver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  print("u3-output", { status: data.status, body: data.body });
});

document.getElementById("u3-complete-feedback").addEventListener("click", async () => {
  const requestId = document.getElementById("u3-request-id").value;
  const data = await request(`/api/judge-feedback/${encodeURIComponent(requestId)}/complete`, {
    method: "POST"
  });
  print("u3-output", { status: data.status, body: data.body });
});

// U6
document.getElementById("u6-list-rooms").addEventListener("click", async () => {
  const data = await request("/api/practice-rooms");
  print("u6-output", { status: data.status, body: data.body });
});

document.getElementById("u6-list-bookings").addEventListener("click", async () => {
  const data = await request("/api/practice-bookings");
  print("u6-output", { status: data.status, body: data.body });
});

document.getElementById("u6-reserve").addEventListener("click", async () => {
  try {
    const roomId = document.getElementById("u6-room-id").value || "room-1";
    const plannedMinutes = Number(document.getElementById("u6-minutes").value || 0);
    const mode = document.getElementById("u6-mode").value;
    const execution = getExecutionSelection("u6-execution-mode", "u6-execution-network");

    const roomsResponse = await request("/api/practice-rooms");
    const room = (roomsResponse.body?.rooms || []).find((item) => item.id === roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    const estimatedMinor = Number(room.rate_minor_per_min || 0) * plannedMinutes;
    const payment = await resolvePaymentReference(mode, estimatedMinor, "u6-reserve");

    const payload = {
      room_id: roomId,
      dancer_name: document.getElementById("u6-dancer-name").value || "Guest Dancer",
      planned_minutes: plannedMinutes,
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request("/api/practice-bookings/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    print("u6-output", {
      status: data.status,
      payment_receipt: payment.receipt,
      body: data.body
    });
  } catch (error) {
    print("u6-output", { error: error.message });
  }
});

document.getElementById("u6-start").addEventListener("click", async () => {
  const bookingId = document.getElementById("u6-booking-id").value;
  const data = await request(`/api/practice-bookings/${encodeURIComponent(bookingId)}/start`, {
    method: "POST"
  });
  print("u6-output", { status: data.status, body: data.body });
});

document.getElementById("u6-end").addEventListener("click", async () => {
  const bookingId = document.getElementById("u6-booking-id").value;
  const payload = { actual_minutes: Number(document.getElementById("u6-actual-minutes").value || 0) };
  const data = await request(`/api/practice-bookings/${encodeURIComponent(bookingId)}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  print("u6-output", { status: data.status, body: data.body });
});

// U7
document.getElementById("u7-list-packs").addEventListener("click", async () => {
  const data = await request("/api/sample-packs");
  print("u7-output", { status: data.status, body: data.body });
});

document.getElementById("u7-purchase").addEventListener("click", async () => {
  try {
    const packId = document.getElementById("u7-pack-id").value || "pack-1";
    const tierId = document.getElementById("u7-tier-id").value || "tier-personal";
    const mode = document.getElementById("u7-mode").value;
    const execution = getExecutionSelection("u7-execution-mode", "u7-execution-network");
    const packsResponse = await request("/api/sample-packs");
    const pack = (packsResponse.body?.packs || []).find((item) => item.id === packId);
    if (!pack) {
      throw new Error("Sample pack not found");
    }
    const tier = (pack.tiers || []).find((item) => item.id === tierId);
    if (!tier) {
      throw new Error("Tier not found for selected sample pack");
    }
    const amountMinor = Number(tier.price_minor || 0);
    const payment = await resolvePaymentReference(mode, amountMinor, "u7-license");
    const payload = {
      tier_id: tierId,
      buyer_name: document.getElementById("u7-buyer-name").value || "Buyer",
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request(`/api/sample-packs/${encodeURIComponent(packId)}/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (data.body?.license?.license_token) {
      document.getElementById("u7-license-token").value = data.body.license.license_token;
    }
    print("u7-output", { status: data.status, payment_receipt: payment.receipt, body: data.body });
  } catch (error) {
    print("u7-output", { error: error.message });
  }
});

document.getElementById("u7-verify").addEventListener("click", async () => {
  const payload = { license_token: document.getElementById("u7-license-token").value };
  const data = await request("/api/sample-packs/licenses/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  print("u7-output", { status: data.status, body: data.body });
});

// U8
document.getElementById("u8-list").addEventListener("click", async () => {
  const data = await request("/api/challenges");
  print("u8-output", { status: data.status, body: data.body });
});

document.getElementById("u8-create").addEventListener("click", async () => {
  const payload = {
    title: document.getElementById("u8-title").value || "Weekly challenge",
    sponsor_name: document.getElementById("u8-sponsor").value || "Sponsor",
    bounty_minor: Number(document.getElementById("u8-bounty").value || 0)
  };
  const data = await request("/api/challenges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (data.body?.challenge?.id) {
    lastU8ChallengeId = data.body.challenge.id;
    document.getElementById("u8-challenge-id").value = lastU8ChallengeId;
  }
  print("u8-output", { status: data.status, body: data.body });
});

document.getElementById("u8-submit").addEventListener("click", async () => {
  const challengeId = document.getElementById("u8-challenge-id").value || lastU8ChallengeId;
  if (!challengeId) {
    print("u8-output", { error: "Set or create a challenge first." });
    return;
  }
  document.getElementById("u8-challenge-id").value = challengeId;
  const payload = {
    dancer_name: document.getElementById("u8-dancer-name").value || "Guest",
    clip_url: document.getElementById("u8-clip-url").value || "https://example.com/clip"
  };
  const data = await request(`/api/challenges/${encodeURIComponent(challengeId)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (data.body?.submission?.id) {
    lastU8SubmissionId = data.body.submission.id;
    document.getElementById("u8-submission-id").value = lastU8SubmissionId;
  }
  lastU8ChallengeId = challengeId;
  print("u8-output", { status: data.status, body: data.body });
});

document.getElementById("u8-score-btn").addEventListener("click", async () => {
  const challengeId = document.getElementById("u8-challenge-id").value || lastU8ChallengeId;
  const submissionId = document.getElementById("u8-submission-id").value || lastU8SubmissionId;
  if (!challengeId || !submissionId) {
    print("u8-output", { error: "Challenge id and submission id are required. Submit an entry first." });
    return;
  }
  document.getElementById("u8-challenge-id").value = challengeId;
  document.getElementById("u8-submission-id").value = submissionId;
  const payload = {
    submission_id: submissionId,
    score: Number(document.getElementById("u8-score").value || 0)
  };
  const data = await request(`/api/challenges/${encodeURIComponent(challengeId)}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  lastU8ChallengeId = challengeId;
  lastU8SubmissionId = submissionId;
  print("u8-output", { status: data.status, body: data.body });
});

document.getElementById("u8-payout").addEventListener("click", async () => {
  try {
    const challengeId = document.getElementById("u8-challenge-id").value || lastU8ChallengeId;
    const submissionId = document.getElementById("u8-submission-id").value || lastU8SubmissionId;
    if (!challengeId || !submissionId) {
      throw new Error("Challenge id and submission id are required. Submit and score an entry first.");
    }
    document.getElementById("u8-challenge-id").value = challengeId;
    document.getElementById("u8-submission-id").value = submissionId;
    const mode = document.getElementById("u8-mode").value;
    const execution = getExecutionSelection("u8-execution-mode", "u8-execution-network");
    const payoutResponse = await request("/api/challenges");
    const challenge = (payoutResponse.body?.challenges || []).find((item) => item.id === challengeId);
    if (!challenge) {
      throw new Error("Challenge not found");
    }
    const amountMinor = Number(challenge.bounty_minor || 0);
    const payment = await resolvePaymentReference(mode, amountMinor, "u8-payout");
    const payload = {
      winner_submission_id: submissionId,
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request(`/api/challenges/${encodeURIComponent(challengeId)}/payout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    lastU8ChallengeId = challengeId;
    lastU8SubmissionId = submissionId;
    print("u8-output", { status: data.status, payment_receipt: payment.receipt, body: data.body });
  } catch (error) {
    print("u8-output", { error: error.message });
  }
});

// U4
document.getElementById("u4-list-crews").addEventListener("click", async () => {
  const data = await request("/api/crews");
  print("u4-output", { status: data.status, body: data.body });
});

document.getElementById("u4-create-crew").addEventListener("click", async () => {
  const payload = {
    name: document.getElementById("u4-crew-name").value || "Demo Crew",
    members: [
      { name: "NOVA", wallet: "0x1111111111111111111111111111111111111111", share_bps: 5000 },
      { name: "SHADOW", wallet: "0x2222222222222222222222222222222222222222", share_bps: 3000 },
      { name: "RAWFIRE", wallet: "0x3333333333333333333333333333333333333333", share_bps: 2000 }
    ]
  };
  const data = await request("/api/crews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (data.body?.crew?.id) {
    document.getElementById("u4-crew-id").value = data.body.crew.id;
  }
  print("u4-output", { status: data.status, body: data.body });
});

document.getElementById("u4-run-split").addEventListener("click", async () => {
  try {
    const crewId = document.getElementById("u4-crew-id").value;
    const amountMinor = Number(document.getElementById("u4-split-amount").value || 0);
    const mode = document.getElementById("u4-mode").value;
    const execution = getExecutionSelection("u4-execution-mode", "u4-execution-network");
    const payment = await resolvePaymentReference(mode, amountMinor, "u4-split");
    const payload = {
      amount_minor: amountMinor,
      source: "ui_demo",
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request(`/api/crews/${encodeURIComponent(crewId)}/split-settlement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    print("u4-output", { status: data.status, payment_receipt: payment.receipt, body: data.body });
  } catch (error) {
    print("u4-output", { error: error.message });
  }
});

// U10
document.getElementById("u10-catalog").addEventListener("click", async () => {
  const data = await request("/api/merch/catalog");
  print("u10-output", { status: data.status, body: data.body });
});

document.getElementById("u10-recommend").addEventListener("click", async () => {
  const payload = {
    style: document.getElementById("u10-style").value || "all",
    budget_minor: Number(document.getElementById("u10-budget").value || 0)
  };
  const data = await request("/api/merch/concierge/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  print("u10-output", { status: data.status, body: data.body });
});

document.getElementById("u10-checkout").addEventListener("click", async () => {
  try {
    const itemId = document.getElementById("u10-item-id").value || "merch-1";
    const quantity = Math.max(1, Number(document.getElementById("u10-qty").value || 1));
    const mode = document.getElementById("u10-mode").value;
    const execution = getExecutionSelection("u10-execution-mode", "u10-execution-network");
    const catalogResponse = await request("/api/merch/catalog");
    const item = (catalogResponse.body?.items || []).find((row) => row.id === itemId);
    if (!item) {
      throw new Error("Merch item not found");
    }
    const amountMinor = Number(item.price_minor || 0) * quantity;
    const payment = await resolvePaymentReference(mode, amountMinor, "u10-checkout");
    const payload = {
      item_id: itemId,
      quantity,
      buyer_name: document.getElementById("u10-buyer").value || "Buyer",
      payment_mode: payment.mode,
      payment_ref: payment.ref,
      execution_mode: execution.execution_mode,
      execution_network: execution.execution_network
    };
    const data = await request("/api/merch/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    print("u10-output", { status: data.status, payment_receipt: payment.receipt, body: data.body });
  } catch (error) {
    print("u10-output", { error: error.message });
  }
});

async function bootstrap() {
  applyDefaultExecutionMode();
  applyEthglobalHackathonExecutionModeUi();
  await loadConfig();
  try {
    await fundKeeperhubOnlineSourceFromUi({ openFaucet: false });
  } catch (_error) {}
  try {
    await fundKeeperhubDestinationGasFromUi({ openFaucet: false });
  } catch (_error) {}
  updateKeeperhubChainHint();
  renderKeeperhubLocalDebugHint(null);
  hydrateSavedCircleWallet();
  print("balances-output", {
    info: "Connect MetaMask and click Refresh Balances to load MetaMask and Circle wallet USDC balances."
  });
  print("ucp-output", {
    info: "Use the UCP buttons to view discovery, run self-test, and execute a sample checkout."
  });
  print("aisa-x402-output", {
    info: "Use this panel to verify x402 config and run a direct AIsa authorization demo call."
  });
  print("aisa-llm-output", {
    info: "Use this panel to run model responses through AIsa in API-key or x402 probe mode."
  });
  refreshAisaLlmModelOptions();
  print("agent-output", {
    info:
      `Default orchestration amounts mirror ~$${(DEMO_USDC_MINOR / 100).toFixed(2)} USDC-equivalent rails. Use Nine-intent rehearsal (choose offchain for instant deck runs) after Load Agent Capabilities.`
  });
  print("keeperhub-output", {
    info: "Load status to see if Arc testnet is listed in KeeperHub; use demo transfer or U5 payout checkbox when your org key and wallet are configured."
  });
  await refreshLeaderboard();
  await loadTutorials();
  await refreshBattle();
}

document.getElementById("ethglobal-demo-execution-mode")?.addEventListener("change", () => applyEthglobalHackathonExecutionModeUi());

bootstrap();
