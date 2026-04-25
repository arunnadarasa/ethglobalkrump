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

async function refreshLeaderboard() {
  const data = await request("/api/tips/leaderboard");
  print("leaderboard", data.body);
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
  const payload = {
    fan_name: document.getElementById("fan-name").value || "Anonymous",
    dancer_id: document.getElementById("dancer-id").value,
    amount_minor: Number(document.getElementById("tip-amount").value)
  };
  const data = await request("/api/tips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  print("leaderboard", data.body);
  await refreshLeaderboard();
});

document.getElementById("try-locked").addEventListener("click", async () => {
  const clipId = document.getElementById("clip-id").value;
  const data = await request(`/api/tutorials/${clipId}`);
  print("tutorial-output", { status: data.status, body: data.body });
});

document.getElementById("pay-unlock").addEventListener("click", async () => {
  const clipId = document.getElementById("clip-id").value;
  const data = await request(`/api/tutorials/${clipId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer_name: "Hackathon Demo Buyer" })
  });
  unlockToken = data.body.unlock_token || "";
  print("tutorial-output", { status: data.status, unlockToken, body: data.body });
});

document.getElementById("open-unlocked").addEventListener("click", async () => {
  const clipId = document.getElementById("clip-id").value;
  const data = await request(`/api/tutorials/${clipId}?unlock_token=${encodeURIComponent(unlockToken)}`);
  print("tutorial-output", { status: data.status, body: data.body });
});

document.getElementById("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    dancer_name: document.getElementById("entry-name").value,
    wallet: document.getElementById("entry-wallet").value,
    entry_fee_minor: Number(document.getElementById("entry-fee").value)
  };
  const data = await request("/api/battle/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  print("battle-output", { status: data.status, body: data.body });
  await refreshBattle();
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

async function bootstrap() {
  await refreshLeaderboard();
  await loadTutorials();
  await refreshBattle();
}

bootstrap();
