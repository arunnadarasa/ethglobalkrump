# MEGA PROMPT FOR LOVABLE (copy everything below the line)

---

You are building **Krump Protocol Agents**: a single-page hackathon demo + Express API that proves **UCP-first commerce** with **human↔agent orchestration** and **optional deep settlement** (Vyper policy + Arc testnet proof), plus **dual payment rails** (MetaMask on Arc + Circle developer-controlled wallets).

Recreate the app **functionally equivalent** to this specification. Prefer clarity and parity over clever refactors. If you must choose, preserve **API shapes**, **UCP schema validation behavior**, and **UI flows**.

## Product name and story

- **Name:** Krump Protocol Agents  
- **Subtitle:** Krump x UCP MVP Demo (U1 / U2 / U5 tracks)  
- **Pitch:** programmable creator-economy flows (tips, paid tutorials, battle entry + payout) with **official UCP** checkout semantics, **agent orchestration** (H2A / A2A / A2H traces), and **Arc credibility** via a deployed + verifiable Vyper policy contract.

## Tech stack (must match)

- **Backend:** Node.js + Express + `dotenv`
- **UCP:** `@ucp-js/sdk` Zod schemas:
  - `CheckoutCreateRequestSchema`
  - `UcpCheckoutResponseSchema`
  - `UcpOrderResponseSchema`
- **Frontend:** static `public/` (HTML + vanilla JS + CSS). No framework required.
- **State:** in-memory module (no DB) for demo persistence in process lifetime.
- **Contracts / tests:** Vyper `0.4.0` + Titanoboa + pytest + `circle-titanoboa-sdk` (Python deps file).
- **CI:** GitHub Actions: Node syntax checks + Python pytest.

## Repository layout (target)

```
package.json
package-lock.json
src/server.js                 # Express app + all routes
src/state.js                  # dancers, clips, payments, battle, helpers
src/agents/orchestrator.js    # agent sessions + trace
src/settlement/vyperPolicy.js # Node-side policy mirror + spend ledger
contracts/AgentSettlementPolicy.vy
scripts/deploy_vyper_policy.py
tests/titanoboa/requirements.txt
tests/titanoboa/test_agent_settlement_policy.py
.github/workflows/ci.yml
public/index.html
public/main.js
public/styles.css
.env.example
README.md
docs/*                        # optional marketing/pitch md
```

## Environment variables (`.env.example` must document all)

### Server

- `PORT` (default 3000)

### Arc / MetaMask (browser)

- `ARC_CHAIN_ID` (default `5042002`)
- `ARC_CHAIN_NAME` (default `Arc Testnet`)
- `ARC_RPC_URL` (default `https://rpc.testnet.arc.network`)
- `ARC_NATIVE_SYMBOL` (default `USDC`)
- `ONCHAIN_TREASURY_ADDRESS` (MetaMask sends native value here)

### Circle (server)

- `CIRCLE_API_BASE` (default `https://api.circle.com`)
- `CIRCLE_TRANSFER_PATH` (default `/v1/w3s/developer/transactions/transfer`)
- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET` (header `X-Entity-Secret` on transfer)
- `CIRCLE_ENTITY_SECRET_RAW` (recommended; used to generate fresh ciphertext)
- `CIRCLE_ENTITY_SECRET_CIPHERTEXT` (fallback)
- `CIRCLE_WALLET_ID`, `CIRCLE_WALLET_SET_ID` (optional)
- Token selector: **`CIRCLE_TOKEN_ID` OR (`CIRCLE_TOKEN_ADDRESS` + `CIRCLE_TOKEN_BLOCKCHAIN`)**
- `CIRCLE_DESTINATION_ADDRESS` (Circle transfer destination)

### Deep settlement + identity (optional but featured)

- `ENABLE_VYPER_SETTLEMENT` (`true`/`false`)
- `VYPER_POLICY_MAX_TICKET_MINOR` (default 5000)
- `VYPER_POLICY_DAILY_CAP_MINOR` (default 25000)
- `VYPER_SETTLEMENT_CONTRACT` (Arc address string; surfaced in settlement “proof” metadata)
- `ERC8004_IDENTITY_REGISTRY` (string; surfaced in settlement “proof” metadata)
- `ERC8004_AGENT_REGISTRY`, `ERC8004_AGENT_ID`, `ERC8004_AGENT_TOKEN_URI`, `ERC8004_AGENT_CAPABILITIES_URI`

### Deploy script only

- `DEPLOYER_PRIVATE_KEY` (for `scripts/deploy_vyper_policy.py`)

## HTTP API (must implement)

### Config

- `GET /api/config`  
  Returns `rails.metamask` + `rails.circle` booleans and config needed by UI (chain id hex, rpc, treasury, token selector, circle paths).

### UCP (official stack)

- `GET /api/ucp/discovery`  
  Returns discovery JSON with `ucp.version`, `capabilities` (checkout + order), and `services.rest.endpoint` pointing to `${origin}/api/ucp`.

- `POST /api/ucp/checkout/create`  
  - Validate body with `CheckoutCreateRequestSchema`.
  - Map each `line_items[].item.id` to tutorial clip price if known; else default unit `100` minor.
  - Build response validated by `UcpCheckoutResponseSchema` and include `checkout` object with `id`, `currency`, `line_items` (normalized), `total_minor`, `total_usd`, `status: created`.

- `GET /api/ucp/orders/:orderId`  
  - Validate envelope with `UcpOrderResponseSchema`.
  - If `orderId` matches a stored payment id, reflect its status; else `unknown`.

- `GET /api/ucp/conformance/self-test`  
  Returns `{ ok, source: "@ucp-js/sdk", checks: { checkout_create_request, checkout_response, order_response } }`.

### Agents (orchestration)

- `GET /api/agents/capabilities`  
  Must include:
  - `identity_enabled` (true if `ERC8004_AGENT_REGISTRY` non-empty)
  - `settlement_mode` (`vyper_policy_enabled` if `ENABLE_VYPER_SETTLEMENT=true`, else `circle_default`)
  - intents: `tip_dancer`, `unlock_clip`, `battle_entry`
  - `sub_agents`, `ucp_core_dependency: true`

- `GET /api/agents/identity`  
  Returns `{ ok, identity: { standard: "erc-8004-style", agent_registry, agent_id, token_uri, capabilities_uri } }` (nulls allowed).

- `POST /api/agents/sessions` body `{ intent, context? }`  
  - Validate intent allowlist.
  - Create session with `trace[]` events.
  - Attach `identity` snapshot on session object.
  - Emit `identity` trace event if identity metadata exists.
  - For `tip_dancer`: fan agent proposes plan.
  - For `battle_entry`: dancer agent proposes details.
  - Payments agent must create UCP checkout via internal builder (not a second protocol).
  - **Critical:** payment instrument in checkout request must satisfy UCP enum: use `type: "card"` (e.g. visa/4242), not `wallet`.
  - If `ENABLE_VYPER_SETTLEMENT`: call `vyperPolicy.evaluate` before checkout with `{ agentId: "payments-agent", amountMinor: previewTotal, intent }`; block with `502` + failed session if not approved.
  - Then fetch order status for checkout id.
  - Return `201` if completed, `502` if failed.

- `GET /api/agents/sessions/:sessionId`  
  Return stored session or 404.

### Settlement helper

- `POST /api/settlement/vyper/evaluate` body `{ agent_id?, amount_minor, intent? }`  
  Always returns evaluation JSON with `ok` + `result` including `policy` + `proof` (include `settlement_contract` + `identity_registry` from env when set).

### Circle onboarding + transfers

- `POST /api/circle/wallets/create`
- `POST /api/circle/entity-secret-ciphertext/generate`
- `GET /api/circle/wallets/:walletId/balances` (try multiple candidate paths like the reference)
- `POST /api/payments/circle/transfer`  
  - If `ENABLE_VYPER_SETTLEMENT`, enforce policy before calling Circle.
  - Use `fetch` to Circle transfer endpoint with `Authorization: Bearer` + `X-Entity-Secret`.

### Domain tracks

**U1 tips**

- `GET /api/tips/leaderboard`
- `POST /api/tips` increments dancer tips + records payment row.

**U2 tutorials**

- `GET /api/tutorials` lists clips.
- `GET /api/tutorials/:clipId` returns `402 payment_required` if not unlocked.
- `POST /api/tutorials/:clipId/pay` creates unlock token + payment row.

**U5 battle**

- `GET /api/battle`
- `POST /api/battle/register`
- `POST /api/battle/close`
- `POST /api/battle/declare-winner`

### Health

- `GET /api/health` `{ ok: true, app: "krump-ucp-mvp" }`

## Frontend UI (must match sections + element IDs)

Serve static from `/`.

### Global

- Connect MetaMask button `#connect-metamask`, status `#wallet-status`
- Rail config pretty-print `#rail-config`

### Circle onboarding

Inputs/buttons as in reference:
- `#circle-wallet-name`, `#circle-blockchain`, `#circle-wallet-set-id`, `#create-circle-wallet`
- `#circle-entity-secret-raw`, `#generate-ciphertext`, `#circle-entity-ciphertext`
- `#save-circle-wallet`, `#circle-wallet-save-status`
- outputs: `#circle-wallet-output`, funding cue `#circle-funding-cue`
- Persist wallet details in `localStorage` key `circleWalletDetails` `{ walletId, walletAddress, walletSetId? }`

### Balances

- `#refresh-balances`, `#balances-output`  
  MetaMask: `eth_getBalance` + optional ERC20 `balanceOf` for `CIRCLE_TOKEN_ADDRESS`  
  Circle: GET balances route

### UCP conformance

- Buttons: `#ucp-load-discovery`, `#ucp-run-self-test`, `#ucp-run-sample-checkout`
- Output `#ucp-output`

### Agent orchestration

- `#agent-load-capabilities`, `#agent-load-identity`
- `#agent-context-json` (optional JSON)
- `#agent-intent` select (`tip_dancer|unlock_clip|battle_entry`)
- `#agent-run-session`, `#agent-get-last-session`
- settlement eval: `#settlement-amount-minor`, `#settlement-evaluate`
- output `#agent-output`

### U1/U2/U5 sections

Match forms and IDs from reference (`tip-form`, `register-form`, etc.) and print JSON to `<pre>` targets.

## Client payment rail behavior (must match)

Three modes:

- `offchain_demo`: no chain call; pass null refs
- `metamask`: ensure chain (`wallet_switchEthereumChain` / `wallet_addEthereumChain`), then `eth_sendTransaction` to treasury with `value = amountMinor * 1e14` wei (reference uses this scaling)
- `circle_wallet`: POST `/api/payments/circle/transfer` with `wallet_id` from saved wallet details if present

## Vyper contract + tests + deploy

### Contract `contracts/AgentSettlementPolicy.vy`

- Stores `owner`, `max_ticket_minor`, `daily_cap_minor`, `spent_today_minor[agent]`
- `__init__(max, daily)` sets owner `msg.sender`
- `can_authorize(agent, amount)` view
- `authorize_payment(agent, amount)` mutating checks
- `set_limits` + `reset_agent_spend` owner-only

### Titanoboa tests

Mirror limits behavior (ticket max, daily cap, owner reset).

### Deploy script `scripts/deploy_vyper_policy.py`

- Reads `ARC_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, optional policy env defaults
- `boa.set_network_env(rpc_url)` then deploy with constructor args

### Arcscan verification (optional doc in README)

Arcscan supports Blockscout v2 verification API:

- `POST https://testnet.arcscan.app/api/v2/smart-contracts/<addr>/verification/via/vyper-code`
- Use `compiler_version: v0.4.0+commit.e9db8d9f`, `license_type: mit`, `evm_version: default`
- Constructor args ABI-encoded two `uint256`: `5000`, `25000` as 32-byte words concatenated.

## CI (`.github/workflows/ci.yml`)

- `npm ci`
- `node --check` on `src/server.js`, `src/agents/orchestrator.js`, `src/settlement/vyperPolicy.js`, `public/main.js`
- Python 3.11: `pip install -r tests/titanoboa/requirements.txt` + `pytest tests/titanoboa -q`

## Known “debug telemetry” (optional)

Current reference code may include `fetch('http://127.0.0.1:7488/ingest/...')` blocks in `src/server.js` and `public/main.js` for local debugging. For a clean Lovable rebuild, **omit** these unless you want parity including debug noise.

## Acceptance checklist (must pass)

1. `npm start` serves UI and APIs on `PORT`.
2. UCP discovery + sample checkout + self-test work.
3. Agent session `tip_dancer` completes with trace including settlement proof when enabled.
4. Circle wallet create + ciphertext generate + transfer path works when env configured.
5. MetaMask chain switch + send works when treasury configured.
6. Tutorial lock/unlock + battle flows behave as specified.
7. CI jobs pass.

---

END OF MEGA PROMPT
