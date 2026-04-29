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
    if (Array.from(select.options).some((option) => option.value === "online")) {
      select.value = "online";
    }
  });
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
  const fallbackAmounts = {
    tip_dancer: 25,
    unlock_clip: 500,
    battle_entry: 500,
    judge_feedback_request: 600,
    crew_split_settlement: 2500,
    practice_room_reserve: 300,
    sample_pack_purchase: 700,
    challenge_payout: 1500,
    merch_concierge_checkout: 5000
  };
  const amountMinor = Number(parsedContext.amount_minor || fallbackAmounts[intent] || 100);
  const payment = await resolvePaymentReference(paymentMode, amountMinor, `agent-${intent}`);
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
  input.value = nextAuto;
  lastAutoAgentId = nextAuto;
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
  const isAllowed = hasAllowedIntents ? allowedIntents.includes(selectedIntent) : true;
  runBtn.disabled = !isAllowed;
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
    return;
  }
  const selectedIntent = document.getElementById("agent-intent")?.value || "";
  const url = `/api/ens/resolve?name=${encodeURIComponent(ensName)}&intent=${encodeURIComponent(selectedIntent)}`;

  const data = await request(url, { method: "GET" });
  if (!data.ok) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: data.body?.error?.message || "ENS resolve failed.",
      variant: "warning"
    });
    return;
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

  const output = {
    route: url,
    body: lastEnsJudgeResolve
  };
  print("ens-identity-output", output);

  updateAgentRunDisabledByEnsGating();
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
  const selectedIntent = document.getElementById("agent-intent")?.value || "";
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
    return;
  }
  if (!arcActorAddress) {
    setEnsJudgeChip({ statusId: "ens-identity-status", chipText: "Set Arc actor address for the ENS addr record.", variant: "warning" });
    return;
  }
  if (!agentId) {
    setEnsJudgeChip({ statusId: "ens-identity-status", chipText: "Set agentId text record value.", variant: "warning" });
    return;
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
    allowedIntent: selectedIntent,
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
        return;
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
      return;
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
    return;
  }

  if (data.body?.demo_mode) {
    setEnsJudgeChip({
      statusId: "ens-identity-status",
      chipText: "Demo mode: payload validated. No onchain write was sent.",
      variant: "success"
    });
    stopEnsSubmissionTimer();
    print("ens-identity-output", { route: "/api/ens/setup-agent", request: payload, body: data.body });
    return;
  }

  stopEnsSubmissionTimer();
  print("ens-identity-output", { route: "/api/ens/setup-agent", request: payload, body: data.body });
  await resolveEnsJudgeIdentityForUi();
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

async function resolvePaymentReference(mode, amountMinor, memo) {
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
  const network = document.getElementById("keeperhub-execution-network")?.value || "base-sepolia";
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
  if (target) {
    target.textContent = `Source wallet blockchain: ARC-TESTNET (USDC). Destination gas wallet blockchain: ${destinationChain} (native gas token).`;
  }
  const reminder = document.getElementById("keeperhub-funding-reminder");
  if (reminder) {
    const sel = document.getElementById("keeperhub-execution-network");
    const label =
      sel?.options?.[sel.selectedIndex]?.text?.trim() || destinationChain.replace(/-/g, " ");
    const native = nativeSymbolByNetwork[network] || "that chain's native token";
    reminder.textContent = `Top up KeeperHub wallets used for online execution on ${label} with USDC and ${native} (native gas on the network you select below).`;
  }
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
  await fundKeeperhubDestinationGasFromUi({ openFaucet: false });
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
  await loadConfig();
  try {
    await fundKeeperhubOnlineSourceFromUi({ openFaucet: false });
  } catch (_error) {}
  try {
    await fundKeeperhubDestinationGasFromUi({ openFaucet: false });
  } catch (_error) {}
  updateKeeperhubChainHint();
  hydrateSavedCircleWallet();
  print("balances-output", {
    info: "Connect MetaMask and click Refresh Balances to load MetaMask and Circle wallet USDC balances."
  });
  print("ucp-output", {
    info: "Use the UCP buttons to view discovery, run self-test, and execute a sample checkout."
  });
  print("agent-output", {
    info: "Use agent controls to run H2A sessions and inspect A2A/A2H traces backed by UCP routes."
  });
  print("keeperhub-output", {
    info: "Load status to see if Arc testnet is listed in KeeperHub; use demo transfer or U5 payout checkbox when your org key and wallet are configured."
  });
  await refreshLeaderboard();
  await loadTutorials();
  await refreshBattle();
}

bootstrap();
