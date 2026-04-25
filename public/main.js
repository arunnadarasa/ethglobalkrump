async function request(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { ok: response.ok, status: response.status, body };
}

function print(targetId, payload) {
  document.getElementById(targetId).textContent = JSON.stringify(payload, null, 2);
}

let unlockToken = "";
let railConfig = null;
let connectedAccount = "";
let lastCreatedCircleWallet = null;
let lastAgentSessionId = "";

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

async function loadAgentCapabilitiesFromUi() {
  const response = await request("/api/agents/capabilities");
  print("agent-output", {
    route: "/api/agents/capabilities",
    ok: response.ok,
    status: response.status,
    body: response.body
  });
}

async function runAgentSessionFromUi() {
  const intent = document.getElementById("agent-intent").value;
  const context = parseAgentContext();
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
    body: response.body
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
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v1',hypothesisId:'T2',location:'public/main.js:sendCirclePayment:entry',message:'Sending circle payment request',data:{amountMinor,memo:memo||null,hasSavedWalletId:Boolean(savedWalletId),savedWalletIdPrefix:savedWalletId?String(savedWalletId).slice(0,8):null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const response = await request("/api/payments/circle/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_minor: amountMinor, memo, wallet_id: savedWalletId })
  });
  // #region agent log
  fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v1',hypothesisId:'T3',location:'public/main.js:sendCirclePayment:response',message:'Circle payment response received',data:{ok:response.ok,status:response.status,hasError:Boolean(response.body?.error),errorMessage:response.body?.error?.message||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v1',hypothesisId:'T1',location:'public/main.js:tip-form:submit',message:'Tip form submitted',data:{mode,amountMinor,dancerId:document.getElementById("dancer-id").value},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const payment = await resolvePaymentReference(mode, amountMinor, "u1-tip");
    const payload = {
      fan_name: document.getElementById("fan-name").value || "Anonymous",
      dancer_id: document.getElementById("dancer-id").value,
      amount_minor: amountMinor,
      payment_mode: payment.mode,
      payment_ref: payment.ref
    };
    const data = await request("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    print("leaderboard", { payment_receipt: payment.receipt, app_response: data.body });
    await refreshLeaderboard();
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7488/ingest/73a172ba-d779-4052-830f-514180f8d969',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b749cd'},body:JSON.stringify({sessionId:'b749cd',runId:'tip-debug-v1',hypothesisId:'T4',location:'public/main.js:tip-form:error',message:'Tip flow failed in client',data:{errorMessage:error.message},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
    const payment = await resolvePaymentReference(mode, Number(clip.priceMinor), "u2-unlock");
    const data = await request(`/api/tutorials/${clipId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer_name: "Hackathon Demo Buyer",
        payment_mode: payment.mode,
        payment_ref: payment.ref
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
    const payment = await resolvePaymentReference(mode, amountMinor, "u5-entry");
    const payload = {
      dancer_name: document.getElementById("entry-name").value,
      wallet: document.getElementById("entry-wallet").value,
      entry_fee_minor: amountMinor,
      payment_mode: payment.mode,
      payment_ref: payment.ref
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
  const data = await request("/api/battle/declare-winner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ winner_entry_id })
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

document.getElementById("agent-run-session").addEventListener("click", async () => {
  try {
    await runAgentSessionFromUi();
  } catch (error) {
    print("agent-output", { error: error.message });
  }
});

document.getElementById("agent-get-last-session").addEventListener("click", async () => {
  await getLastAgentSessionFromUi();
});

async function bootstrap() {
  await loadConfig();
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
  await refreshLeaderboard();
  await loadTutorials();
  await refreshBattle();
}

bootstrap();
