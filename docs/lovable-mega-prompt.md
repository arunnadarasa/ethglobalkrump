# MEGA PROMPT FOR LOVABLE (copy everything below the line)

---

You are building **Krump Protocol Agents**: a single-page hackathon demo + Express API that proves **UCP-first commerce** with **human↔agent orchestration** and **optional deep settlement** (Vyper policy + Arc testnet proof), plus **dual payment rails** (MetaMask on Arc + Circle developer-controlled wallets), and **optional KeeperHub** ([ETHGlobal OpenAgents](https://ethglobal.com/events/openagents/prizes) sponsor) execution in two modes: local Arc testnet and online testnets via CCTP bridge.

Recreate the app **functionally equivalent** to this specification. Prefer clarity and parity over clever refactors. If you must choose, preserve **API shapes**, **UCP schema validation behavior**, and **UI flows**.

## Product name and story

- **Name:** Krump Protocol Agents  
- **Subtitle:** Krump x UCP Demo (U1/U2/U3/U4/U5/U6/U7/U8/U10 tracks)  
- **Pitch:** programmable creator-economy flows (tips, tutorials, feedback marketplace, room booking, battle payout, licensing, challenge bounties, crew split accounting, merch concierge) with **official UCP** checkout semantics, **agent orchestration** (H2A / A2A / A2H traces), **Arc credibility** via a deployed + verifiable Vyper policy contract, and **optional KeeperHub** on-chain execution in local/online mode (`POST /execute/transfer`) that does not replace UCP or Circle as the commerce core.

## Tech stack (must match)

- **Backend:** Node.js **20+** + Express + `dotenv` (see `package.json`: `@ucp-js/sdk`, `@circle-fin/app-kit`, `@circle-fin/bridge-kit`, `@circle-fin/adapter-circle-wallets`, `express`, `dotenv`; scripts `start` + `dev`)
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
src/settlement/cctpBridge.js  # Online mode: Arc USDC -> destination via Circle Bridge Kit CCTP + balance/gas hints
src/keeperhub/client.js       # KeeperHub REST: chains, execute/transfer, execution status (numeric network ids where required)
src/ens/ensip25.js            # strict ENSIP-25 key encoding + non-empty attestation helpers
src/ens/resolveAgentEns.js    # Universal Resolver reads + trust fields
src/ens/setupAgentEns.js      # Sepolia text-record writes incl. ENSIP-25 key/value
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
- `ERC8004_AGENT_REGISTRY`, `ERC8004_REGISTRY_RPC_URL`, `ERC8004_AGENT_ID`, `ERC8004_AGENT_TOKEN_URI`, `ERC8004_AGENT_CAPABILITIES_URI`

### ENS / ENSIP-25 baseline + bidirectional trust (optional judge flow)

- `ENS_SEPOLIA_RPC_URL`, `ENS_UNIVERSAL_RESOLVER_ADDRESS`, `ENS_PRIVATE_KEY` (and related `ENS_*` / `AGENT_ARC_ADDRESS` from `.env.example` for scripted setup)
- `ENSIP25_REGISTRY_INTEROP` — optional full ERC-7930 interoperable registry address hex (wins over address+chain derivation)
- `ENSIP25_REGISTRY_ADDRESS` + `ENSIP25_REGISTRY_CHAIN_ID` — optional EVM registry + chain id when interop hex is not set (`ENSIP25_REGISTRY_CHAIN_ID` defaults to `ARC_CHAIN_ID`)
- If neither interop nor address is set, the server may parse `ERC8004_AGENT_REGISTRY` when shaped like `eip155:<chainId>:0x…`

### Deploy script only

- `DEPLOYER_PRIVATE_KEY` (for `scripts/deploy_vyper_policy.py`)

### KeeperHub (optional; ETHGlobal OpenAgents sponsor)

- `KEEPERHUB_API_KEY` — **organization** key prefix `kh_` only (not user webhook `wfb_` keys)
- `KEEPERHUB_API_KEY_LOCAL` — optional; preferred when `KEEPERHUB_API_BASE` points to local/self-hosted KeeperHub
- `KEEPERHUB_API_KEY_ONLINE` — optional; preferred when `KEEPERHUB_API_BASE` points to hosted KeeperHub
- `KEEPERHUB_API_BASE` — default `https://app.keeperhub.com/api` (must include `/api`; normalize `https://app.keeperhub.com` → default)
- `KEEPERHUB_EXECUTE_NETWORK` — optional slug override for `POST /execute/transfer` `network` field when Arc auto-detection is insufficient
- `KEEPERHUB_TOKEN_ADDRESS` — optional; defaults to `CIRCLE_TOKEN_ADDRESS` for ERC-20 transfers; omit for native
- `KEEPERHUB_TOKEN_DECIMALS`, `KEEPERHUB_TOKEN_SYMBOL`, `KEEPERHUB_GAS_LIMIT_MULTIPLIER` — optional
- `KEEPERHUB_ONLINE_DEFAULT_NETWORK` — default online destination (`base-sepolia` recommended)

### Online CCTP bridge (Circle Bridge Kit; optional)

Bridge Kit drives burns/mints from **Arc testnet USDC** to the selected destination testnet. Tune with:

- `POLYGON_AMOY_RPC_URL` — optional dedicated Polygon Amoy HTTP RPC
- `POLYGON_AMOY_RPC_PUBLIC_FIRST` — `true` (default) to try public Amoy RPCs before `POLYGON_AMOY_RPC_URL`
- `ARC_BRIDGE_TRANSFER_SPEED` — `FAST` or `SLOW` (Bridge Kit attestation pacing)
- `ALLOW_LOW_DESTINATION_GAS` — `true` to attempt bridge when destination native is below **recommended** minimum (debug only)

Recommended **minimum native gas** per destination (Circle signer, pre-mint) is implemented in `src/settlement/cctpBridge.js` (chain-accurate symbols in API/UI, e.g. **POL** on `polygon-amoy`).

## HTTP API (must implement)

### Config

- `GET /api/config`  
  Returns `rails` object shaped like the reference:
  - `rails.metamask`: `{ chain_id, chain_id_hex, chain_name, rpc_url, symbol, treasury_address }`
  - `rails.circle.enabled` is `true` only when **all** are true:
    - `CIRCLE_API_KEY` non-empty
    - `CIRCLE_ENTITY_SECRET` non-empty (used as `X-Entity-Secret` on transfer)
    - `activeCircleWalletId` resolved (env `CIRCLE_WALLET_ID` or last created wallet id)
    - token selector present: **`CIRCLE_TOKEN_ID` OR (`CIRCLE_TOKEN_ADDRESS` + `CIRCLE_TOKEN_BLOCKCHAIN`)**
  - Also include `wallet_id`, `wallet_set_id`, token fields, `destination_address` (fallback to treasury), `api_base`, `transfer_path`.
  - `rails.keeperhub`: `{ api_key_configured, api_base }` (boolean reflects presence of `KEEPERHUB_API_KEY`, not the secret itself).

### AIsa LLM x402 demo route

- `POST /api/aisa/llm/chat` body `{ mode, model, capability, endpoint_path, temperature, max_tokens, messages[] }`
- Modes:
  - `api_key_proxy` -> `/v1/chat/completions` style path.
  - `x402_probe` -> must target `/apis/v2/*` path.
  - `x402_external_settle` -> `/apis/v2/*` with external replay headers.
- For x402 probe demo parity, default/fallback endpoint should be `/apis/v2/perplexity/sonar`.
- Probe response semantics:
  - return `upstream_status` and `expected_payment_challenge`.
  - `402` + `expected_payment_challenge: true` is considered successful challenge detection.
  - probe mode may return `answer: null` by design.
- External-settle semantics:
  - challenge step: no replay headers, return normalized challenge payload on `402`.
  - replay step: require `replay_requested=true` and `replay_headers` (JSON object) to retry and return final answer.
  - when upstream does not accept settlement, preserve typed `402` replay errors (`insufficient_balance`, validity/policy reasons) in normalized response.
  - demo fallback: if paid replay is blocked upstream, operators should pivot to `api_key_proxy` for answer output while still showcasing x402 challenge/replay capability.
- Keep fixed model allowlist on server-side validation and reject unsupported models with typed errors.

### KeeperHub (sponsor execution layer)

- `GET /api/keeperhub/status` — JSON: `configured`, `api_base`, `arc_chain_id`, `arc_supported`, `execute_network`, matched `chain` summary, `token_address_configured`, or `error` string if chains call failed.
- `GET /api/keeperhub/chains?includeDisabled=true|false` — requires key; returns `{ ok, arc_chain_id, matched, chains }`.
- `GET /api/execution/networks` — returns `{ modes, online_default_network, online_networks }`.
- `POST /api/keeperhub/execute-transfer` — body `{ recipient_address, amount_minor, execution_mode, execution_network }`; `local` mode keeps Arc transfer path, `online` mode runs **Bridge Kit** CCTP Arc→target then KeeperHub execute transfer on target network.
- `POST /api/keeperhub/online-source-wallet/fund-hint` — Arc online bridge source wallet + USDC balance + Circle faucet cue.
- `POST /api/keeperhub/online-destination-gas/fund-hint` — body `{ execution_network }`; returns signer address, native + USDC balances, `signer_native_min_recommended`, `keeperhub_executor_gas_hint` / `_short`, `instructions` (Circle signer vs KeeperHub org executor).
- **Client module behavior:** `GET /chains` with Bearer; reject `wfb_` keys for REST with clear error; on non-JSON HTML responses, surface hint about missing `/api` in base URL; map some online destinations to **numeric** `network` chain IDs for `/execute/transfer` when string slugs are rejected.
- **Local Arc behavior (important):**
  - when Arc chain id `5042002` is detected, resolve execute network to `arc-testnet` (do not use opaque chain row ids like `u93e...` as execute network).
  - choose API key by base URL: local base (`localhost`/`127.0.0.1`) prefers `KEEPERHUB_API_KEY_LOCAL`; hosted base prefers `KEEPERHUB_API_KEY_ONLINE`; both fallback to `KEEPERHUB_API_KEY`.
  - expected local success signals: `GET /api/keeperhub/status` returns `arc_supported: true` and `execute_network: "arc-testnet"`, and local `POST /api/keeperhub/execute-transfer` returns completed execution with tx hash.

### ENS Judge identity routes (must implement)

- `GET /api/ens/resolve?name=<ensName>&intent=<optionalIntent>&registry=<optional>&agentId=<optional>`
  - resolves via Universal Resolver on Sepolia and returns:
    - `ens_name`
    - `agent_actor_address`
    - `text` (`agentId`, `tokenUri`, `capabilitiesUri`, `allowedIntents`, `arcAddress`)
    - `allowed_intents`
    - `is_allowed_for_intent`
    - when `registry` + `agentId` resolve (or env defaults apply): `ensip25_spec_verified`, `registry_side_verified`, `ensip25_bidirectional_verified`, `ensip25_key`, `ensip25_value` (and related trust metadata)
- `GET /api/ens/signer-balance`
  - returns signer wallet + SepoliaETH balance from `ENS_PRIVATE_KEY`.
- `GET /api/ens/name-status?name=<ensName>`
  - returns ownership status + owner + registration value estimate + signer shortfall.
- `POST /api/ens/setup-agent`
  - accepts UI-driven fields:
    - `ensName`, `arcActorAddress`, `agentId`, `tokenUri`, `capabilitiesUri`, `allowedIntent`, `writeMode`
    - ENSIP-25 write trio (all optional but should be set together for trust): `ensip25Registry`, `ensip25AgentId`, `ensip25Value` (non-empty `ensip25Value` is baseline proof; high-risk still requires registry backlink match)
    - workshop extras: `attestor`, `attestationUpdatedAt`, `highRiskIntents`, privacy + versioning text fields as in reference README
    - for `metamask` mode also require `metamaskSigner`, `metamaskProofMessage`, `metamaskProofSignature`
  - modes:
    - `demo` => validate + preview only
    - `circle_wallet` / `metamask` => write on Sepolia via server signer
- `POST /api/ens/verify-attestation`
  - accepts `{ ensName, intent, registry, agentId }`
  - returns `trust` verdict fields (`ensip25_spec_verified`, `registry_side_verified`, `ensip25_bidirectional_verified`, `ensip25_key`, `ensip25_value`, `is_high_risk_intent`, `is_trusted_for_intent`, …) plus an `ensip25` object with `key`, `verified`, `spec_verified`, `bidirectional_verified`, `value`, and registry interop metadata where applicable

### UCP (official stack)

- `GET /api/ucp/discovery`  
  Returns discovery JSON with `ucp.version`, `capabilities` (checkout + order), and `services.rest.endpoint` pointing to `${origin}/api/ucp`.

- `POST /api/ucp/checkout/create`  
  - Validate body with `CheckoutCreateRequestSchema`.
  - Map each `line_items[].item.id` to tutorial clip price if known; else default unit `100` minor.
  - Build response validated by `UcpCheckoutResponseSchema` and include `checkout` object with `id`, `currency`, `line_items` (normalized), `total_minor`, `total_usd`, `status: created`.
  - **Normalized line item shape** (demo-specific, but must match):
    - `{ item_id, quantity, unit_minor, line_total_minor }` where `line_total_minor = unit_minor * quantity`
  - `checkout.id` should be generated like `ucp-checkout-<random>`.

- `GET /api/ucp/orders/:orderId`  
  - Validate envelope with `UcpOrderResponseSchema`.
  - `order.id` equals the `:orderId` path param.
  - `order.status` is `payments[].status` when a payment row exists with `id === orderId`, else `"unknown"`.
  - When known, also include `payment_mode`, `amount_minor`, `amount_usd`.

- `GET /api/ucp/conformance/self-test`  
  Returns `{ ok, source: "@ucp-js/sdk", checks: { checkout_create_request, checkout_response, order_response } }`.

### Agents (orchestration)

- `GET /api/agents/capabilities`  
  Must include:
  - `identity_enabled` (true if `ERC8004_AGENT_REGISTRY` non-empty)
  - `settlement_mode` (`vyper_policy_enabled` if `ENABLE_VYPER_SETTLEMENT=true`, else `circle_default`)
  - intents: `tip_dancer`, `unlock_clip`, `battle_entry`, `judge_feedback_request`, `crew_split_settlement`, `practice_room_reserve`, `sample_pack_purchase`, `challenge_payout`, `merch_concierge_checkout`
  - `sub_agents`, `ucp_core_dependency: true`
  - Also include `version`, `model: "openclaw-style-inrepo"`, `optional_gateway_adapter: true` (parity with reference).
  - `keeperhub_execution: true` when `KEEPERHUB_API_KEY` is set (non-empty).

- `GET /api/agents/identity`  
  Returns `{ ok, identity: { standard: "erc-8004-style", agent_registry, agent_id, token_uri, capabilities_uri } }` (nulls allowed).
  (ENS-derived identity is injected into individual `sessions` via `context.agent_ens_name`, not returned directly by this endpoint.)

- `POST /api/agents/sessions` body `{ intent, context? }`  
  - Validate intent allowlist from capabilities (dynamic from orchestrator intent list; do not hardcode only 3-4).
  - Create session with `trace[]` events.
  - Attach `identity` snapshot on session object.
  - Emit `identity` trace event if identity metadata exists.
  - Accept payment rail context in `context`: `payment_mode`, `payment_ref`, `amount_minor`.
  - If `payment_mode !== "offchain_demo"` and `payment_ref` is missing, fail session with an error trace.
  - Emit an early `payments_agent` trace event recording accepted payment context (`payment_mode`, `payment_ref`, `amount_minor`).
  - Optional ENS identity mode: if `context.agent_ens_name` is provided, the server resolves the ENS name (via ENS Universal Resolver reads against Sepolia RPC) and:
    - injects ENS-derived identity into `session.identity`
    - sets `context.agent_actor_address` (resolved addr/override) and `context.__ensAllowedIntents`
    - enforces ENS `allowedIntents` gating for which intents may run
    - for **high-risk** intents (`challenge_payout`, `crew_split_settlement` by default), requires `ensip25_bidirectional_verified=true` (ENSIP-25 baseline plus matching registry backlink) before the session proceeds
  - For `tip_dancer`: fan agent proposes plan.
  - For `battle_entry`: dancer agent proposes details.
  - Payments agent must create UCP checkout via internal builder (not a second protocol).
  - **Critical:** payment instrument in checkout request must satisfy UCP enum: use `type: "card"` (e.g. visa/4242), not `wallet`.
  - If `ENABLE_VYPER_SETTLEMENT`: call `vyperPolicy.evaluate` before checkout with `{ agentId: context.agent_actor_address || "payments-agent", amountMinor: previewTotal, intent }`; block with `502` + failed session if not approved.
  - Then fetch order status for checkout id.
  - Return `201` if completed, `502` if failed.
  - **Orchestrator behavior details (must match):**
    - Trace events are `{ id: evt-<random>, at: ISO8601, ...fields }`.
    - `fanAgentForTip`: reads `context.dancer_id` default `dancer-1`, `context.amount_minor` default `25`, returns `{ action: "propose_tip", dancer_id, quantity: ceil(amount_minor/100) }` with quantity at least 1.
    - `dancerAgentForBattle`: returns `{ action: "confirm_battle_entry", dancer_name: context.dancer_name || "Guest Dancer", wallet: context.wallet || zero address }`.
    - `resolveItemId`: `unlock_clip` uses `context.clip_id || "clip-1"`; `battle_entry` uses `context.clip_id || "clip-2"`; `merch_concierge_checkout` uses `context.item_id || "merch-1"`; others default `context.clip_id || "clip-1"`.
    - `quantity = max(1, Number(context.quantity || 1))`.
    - `previewAmountMinor = (clip.priceMinor || 100) * quantity` (clip lookup by id).
    - On success: `session.status = "completed"` and `session.summary` is a short human string; on error: `failed` + `{kind:"error", message}`.

- `GET /api/agents/sessions/:sessionId`  
  Return stored session or 404.

### Settlement helper

- `POST /api/settlement/vyper/evaluate` body `{ agent_id?, amount_minor, intent? }`  
  Always returns evaluation JSON with `ok` + `result` including `policy` + `proof` (include `settlement_contract` + `identity_registry` from env when set).
  - **Node-side policy mirror** (when `ENABLE_VYPER_SETTLEMENT` is used by checkout/transfer/orchestrator):
    - Track per-agent spend in-memory (`spentByAgent` map).
    - Reject if amount not integer `<1`, `> VYPER_POLICY_MAX_TICKET_MINOR`, or would exceed `VYPER_POLICY_DAILY_CAP_MINOR` for that agent.
    - On approval, increment ledger; on rejection, do not increment.
    - `proof` includes `intent`, `spent_before_minor`, `spent_after_minor`.

### Circle onboarding + transfers

- `POST /api/circle/wallets/create`
- `POST /api/circle/entity-secret-ciphertext/generate`
- `GET /api/circle/wallets/:walletId/balances` (try multiple candidate paths like the reference)
- `POST /api/payments/circle/transfer`  
  - If `ENABLE_VYPER_SETTLEMENT`, enforce policy **inside transfer** too (`evaluate({ agentId:"payments-agent", amountMinor, intent:"circle_transfer" })`) and throw if blocked.
  - Use `fetch` to `${CIRCLE_API_BASE}${CIRCLE_TRANSFER_PATH}` with `Authorization: Bearer` + `X-Entity-Secret: CIRCLE_ENTITY_SECRET`.
  - Request JSON must include `walletId`, fresh `entitySecretCiphertext` (prefer generating from `CIRCLE_ENTITY_SECRET_RAW` via Circle public key RSA-OAEP-SHA256), `destinationAddress` (`CIRCLE_DESTINATION_ADDRESS` else treasury), `amounts: [(amountMinor/100).toFixed(2)]`, `feeLevel: "MEDIUM"`, `idempotencyKey: uuid`, `metadata.memo`.
  - Token: `tokenId` if set, else `tokenAddress` + `blockchain`.

**Circle wallet create rules (must match reference quirks):**

- Requires `CIRCLE_API_KEY`.
- Accepts `entity_secret_raw` **or** `entity_secret_ciphertext` (or env fallbacks).
- If `wallet_set_id` missing:
  - If only ciphertext path (no raw secret): **error** telling user raw secret is needed to auto-generate unique ciphertexts for wallet set bootstrap.
  - If raw secret exists: generate ciphertext, create wallet set via `/v1/w3s/developer/walletSets` when none cached, then create wallet via `/v1/w3s/developer/wallets` with `blockchains: [<blockchain>]`, `accountType: "EOA"`, `count: 1`.
- Response should echo `active_wallet_id` / `active_wallet_set_id` after creation.

**Entity secret ciphertext generation:**

- `POST /api/circle/entity-secret-ciphertext/generate` uses `GET /v1/w3s/config/entity/publicKey` then RSA-OAEP-SHA256 encrypt.
- Accept entity secret as **64-char hex (32 bytes)** or **base64 that decodes to 32 bytes**.

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
- `POST /api/battle/declare-winner` — body `{ winner_entry_id, execute_via_keeperhub?: boolean }`. When `execute_via_keeperhub` is true and `KEEPERHUB_API_KEY` is set, after pushing the payout record call KeeperHub transfer to `winner.wallet` for `amount_minor = totalPoolMinor`; merge `keeperhub` + optional `execution_status` onto payout; set `settlement_status` to `keeperhub_submitted` / `keeperhub_failed` / `keeperhub_error` as appropriate. When key missing but flag true, set `keeperhub.skipped` with message (do not fail the HTTP success of declare-winner).

**U3 feedback marketplace**

- `GET /api/judge-feedback`
- `POST /api/judge-feedback/requests`
- `POST /api/judge-feedback/:requestId/deliver`
- `POST /api/judge-feedback/:requestId/complete`

**U6 practice room booking**

- `GET /api/practice-rooms`
- `GET /api/practice-bookings`
- `POST /api/practice-bookings/reserve`
- `POST /api/practice-bookings/:bookingId/start`
- `POST /api/practice-bookings/:bookingId/end`

**U7 sample pack licensing**

- `GET /api/sample-packs`
- `POST /api/sample-packs/:packId/purchase`
- `POST /api/sample-packs/licenses/verify`

**U8 skill challenges + bounties**

- `GET /api/challenges`
- `POST /api/challenges`
- `POST /api/challenges/:challengeId/submit`
- `POST /api/challenges/:challengeId/score`
- `POST /api/challenges/:challengeId/payout`

**U4 crew revenue split**

- `GET /api/crews`
- `POST /api/crews`
- `POST /api/crews/:crewId/split-settlement`

**U10 merch concierge**

- `GET /api/merch/catalog`
- `POST /api/merch/concierge/recommend`
- `POST /api/merch/checkout`

### In-memory seed data (must match)

**Dancers (`dancers`)**

- `dancer-1` NOVA tipsMinor 0
- `dancer-2` SHADOW tipsMinor 0
- `dancer-3` RAWFIRE tipsMinor 0

**Tutorial clips (`tutorialClips`)**

- `clip-1` Chest Pop Fundamentals — 25 minor — NOVA
- `clip-2` Arm Swing Variations — 40 minor — SHADOW
- `clip-3` Stomp Timing and Control — 30 minor — RAWFIRE

**Other stores**

- `payments[]`, `entries[]`, `payouts[]`
- `unlocks` map: `unlockToken -> Set(clipId)`
- `battleClosed` boolean toggled by `/api/battle/close`
- `feedbackRequests[]`, `practiceRooms[]`, `practiceBookings[]`
- `samplePacks[]`, `issuedLicenses[]`
- `challenges[]`, `challengeSubmissions[]`, `challengePayouts[]`
- `crews[]`, `crewSettlements[]`
- `merchCatalog[]`, `merchOrders[]`

### Domain endpoint contracts (must match)

**`GET /api/tips/leaderboard`**

- Returns `{ track:"U1", leaderboard:[{id,name,tips_minor,tips_usd}], settlement_network:"Arc_Testnet", payment_rail:"Circle_Gateway_Nanopayments" }` (leaderboard sorted desc by tips).

**`POST /api/tips`**

- Body `{ fan_name?, dancer_id, amount_minor:int>=1, payment_mode?, payment_ref? }`
- Errors: unknown dancer `404`, bad amount `400`
- Side effects: increment `dancer.tipsMinor`, push payment `{ id: tip-<rand>, type:"tip", fan_name, dancer_id, amount_minor, payment_mode default offchain_demo, payment_ref, status:"authorized_offchain", created_at }`
- Response `201` includes `payment_id`, `amount_usd`, dancer subset, `gateway` object, refreshed leaderboard.

**`GET /api/tutorials`**

- `{ track:"U2", tutorials: clips + price_usd }`

**`GET /api/tutorials/:clipId`**

- Locked unless unlock token contains clip:
  - Accept token via header `x-unlock-token` **or** query `unlock_token`
  - If locked: `402` with `{ error:{code:"payment_required",...}, payment:{ protocol:"x402", amount_minor, amount_usd, seller } }`
  - If unlocked: `200` with clip + fixed `content` object (use the reference copy).

**`POST /api/tutorials/:clipId/pay`**

- Body `{ buyer_name?, payment_mode?, payment_ref? }`
- Creates `unlock_token` like `unlock-<rand>`, stores `unlocks.set(token, Set(clipId))`, pushes payment `{ type:"tutorial_unlock", clip_id, buyer_name, amount_minor: clip.priceMinor, status:"authorized_offchain", ... }`
- Response includes `unlock_token` + amounts.

**`GET /api/battle`**

- `{ track:"U5", battle_closed, entrants: entries, total_pool_minor, total_pool_usd, payouts }`

**`POST /api/battle/register`**

- If `battle_closed`: `409`
- Requires `dancer_name` + `wallet` strings
- `entry_fee_minor` must be integer `>= 100`
- Push entry `{ id: entry-<rand>, dancer_name, wallet, entry_fee_minor, entry_fee_usd, paid_via default offchain_demo, payment_ref, created_at }`

**`POST /api/battle/close`**

- Sets `battle_closed=true`, returns confirmation JSON.

**`POST /api/battle/declare-winner`**

- Body `{ winner_entry_id }` must match an entrant
- Payout amount is **sum of all entry fees** (full pool), pushes payout `{ id: payout-<rand>, winner_entry_id, winner_name, winner_wallet, amount_minor, amount_usd, chain:"Arc_Testnet", settlement_status:"submitted", created_at }`

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
- `#circle-blockchain` options should include at least: `ARC-TESTNET`, `BASE-SEPOLIA`, `ETH-SEPOLIA`, `ARB-SEPOLIA`, `MATIC-AMOY`, `AVAX-FUJI`
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

### KeeperHub (UI)

- `#keeperhub-funding-reminder` — persistent note: fund with **USDC** + selected chain **native gas** for online execution (updates when `#keeperhub-execution-network` changes).
- Add dedicated guidance blocks:
  - `#keeperhub-local-dedicated` (Arc-only local testing, no CCTP prerequisite)
  - `#keeperhub-online-dedicated` (online CCTP + destination-chain gas path)
  - toggle visibility by `#keeperhub-execution-mode`
- `#keeperhub-load-status`, `#keeperhub-load-chains`, `#keeperhub-demo-recipient`, `#keeperhub-demo-amount`, `#keeperhub-demo-transfer`
- Add `#keeperhub-refresh-balances` button to re-fetch source + destination balances without opening faucet links.
- Include inline hints:
  - source balance (`#keeperhub-source-balance-hint`)
  - destination balance (`#keeperhub-destination-balance-hint`)
  - signer source mode (`#keeperhub-signer-source-hint`)
  - signer wallet id (`#keeperhub-signer-wallet-id-hint`)
  - gas warning chip (`#keeperhub-gas-warning`) and fallback warning chip (`#keeperhub-signer-warning`)
- Output `#keeperhub-output`
- In `KeeperHub local (Arc)` mode:
  - disable destination network selector and destination-gas funding button
  - show Arc-only copy in chain/funding hints (explicitly "no CCTP" for local mode)

### Agent orchestration

- `#agent-load-capabilities`, `#agent-load-identity`
- `#agent-context-json` (optional JSON)
- `#agent-intent` select (must include all intents listed by `/api/agents/capabilities`; at minimum: `tip_dancer|unlock_clip|battle_entry|judge_feedback_request|crew_split_settlement|practice_room_reserve|sample_pack_purchase|challenge_payout|merch_concierge_checkout`)
- `#agent-payment-mode` select (`metamask|circle_wallet|offchain_demo`)
- `#agent-execution-mode` select (`local|online`)
- `#agent-execution-network` select (`ethereum-sepolia|base-sepolia|polygon-amoy|arbitrum-sepolia|avalanche-fuji`)
- `#agent-run-session`, `#agent-get-last-session`
- settlement eval: `#settlement-amount-minor`, `#settlement-evaluate`
- output `#agent-output`
- On `#agent-load-capabilities`: repopulate the `#agent-intent` dropdown from response `body.agents.intents` (keep currently selected value when still available).
- On `#agent-run-session`: before posting session, resolve payment via selected rail and include `{ payment_mode, payment_ref, amount_minor }` in context; show `payment_receipt` in output.

### AIsa LLM Chat Demo panel (must include)

- Inputs and controls:
  - mode select: `#aisa-llm-mode` (`api_key_proxy`, `x402_probe`)
  - capability select: `#aisa-llm-capability` (`text`, `audio`, `coding`, `image`, `video`, `vision`)
  - model select: `#aisa-llm-model` (filtered by capability from a fixed catalog)
  - endpoint input: `#aisa-llm-endpoint`
  - prompt inputs: `#aisa-llm-system`, `#aisa-llm-user`
  - params: `#aisa-llm-temperature`, `#aisa-llm-max-tokens`
  - action/output: `#aisa-llm-run`, `#aisa-llm-output`
- Behavior:
  - in `x402_probe`, auto-fill endpoint to `/apis/v2/perplexity/sonar` when empty/invalid.
  - in `x402_external_settle`, use the same `/apis/v2/perplexity/sonar` fallback when endpoint is empty/invalid.
  - show formatted response with `upstream_status`, `expected_payment_challenge`, and raw payload.
  - treat `402` in probe mode as a success indicator for challenge detection.
  - include replay controls (`replay_requested`, `replay_headers`) for external settlement handoff.
  - surface replay failure reasons as first-class UX output (do not collapse into generic errors).

### ENS Judge card (must match)

- Inputs:
  - `#ens-name-input` (auto-append `.eth` when label-only)
  - `#ens-arc-actor-address`
  - `#ens-agent-id` (auto-helper: `agent.<ens-label>` unless user manually overrides)
  - `#ens-token-uri`
  - `#ens-capabilities-uri`
  - `#ensip25-registry`, `#ensip25-agent-id`, `#ensip25-value`, `#ens-attestor`, `#ens-high-risk-intents`
  - `#ens-payout-mode`, `#ens-privacy-receiver`
  - `#ens-agent-version`, `#ens-capabilities-version`, `#ens-compatible-intents`
- Selectors:
  - `#ens-arc-address-source` (`metamask`, `circle_wallet`) + `#ens-fill-arc-actor`
  - `#ens-write-mode` (`demo`, `circle_wallet`, `metamask`)
- Buttons:
  - `#ens-run-guided-flow` (primary one-click ENSIP-25 flow)
  - `#ens-check-signer-balance`
  - `#ens-check-name-status`
  - (`#ens-verify-attestation`, `#ens-resolve-identity`, `#ens-register-update`) may exist as helper actions but guided flow should be primary UX
- Chips:
  - `#ens-identity-status`
  - `#ens-gating-chip`
  - `#ens-signer-balance-chip`
  - `#ens-name-status-chip`
  - `#ens-trust-chip`
  - `#ens-privacy-chip`
  - `#ens-versioning-chip`
- In-flight UX:
  - show elapsed timer while ENS setup request is running
  - include explicit copy that commit→register may take ~60-90s for unowned names
  - show ENSIP-25 progress chips for write/upsert/verify/resolve stages
  - show trust badges for `Spec`, `Registry`, and `Bidirectional`

### U1/U2/U5 sections

Match forms and IDs from reference (`tip-form`, `register-form`, etc.) and print JSON to `<pre>` targets. U5 includes checkbox `#keeperhub-on-payout` — when checked, `declare-winner` POST includes `execute_via_keeperhub: true`.

### U3/U6/U7/U8/U4/U10 sections

- Add one section per use case with explicit action buttons and output panes:
  - U3 output: `#u3-output`
  - U6 output: `#u6-output`
  - U7 output: `#u7-output`
  - U8 output: `#u8-output`
  - U4 output: `#u4-output`
  - U10 output: `#u10-output`

## Client payment rail behavior (must match)

Three modes:

- `offchain_demo`: no chain call; pass null refs
- `metamask`: ensure chain (`wallet_switchEthereumChain` / `wallet_addEthereumChain`), then `eth_sendTransaction` to treasury with `value = amountMinor * 1e14` wei (reference uses this scaling)
- `circle_wallet`: POST `/api/payments/circle/transfer` with `wallet_id` from saved wallet details if present

## Per-request execution mode (must match)

- Every payment-bearing action payload includes:
  - `execution_mode`: `local|online`
  - `execution_network`: required when `online`
- Supported online target networks:
  - `ethereum-sepolia`
  - `base-sepolia`
  - `polygon-amoy`
  - `arbitrum-sepolia`
  - `avalanche-fuji`
- Native-symbol labels in UX should be chain-accurate (`POL` for Polygon Amoy, `AVAX` for Avalanche Fuji).
- Online mode backend behavior:
  1. bridge USDC from Arc testnet to target network via **Circle Bridge Kit** CCTP (`src/settlement/cctpBridge.js`)
  2. execute KeeperHub transfer on target network (`network` slug or numeric id per `src/keeperhub/client.js`)
  3. return combined receipt metadata (`bridge`, `keeperhub`, `payment_ref`)

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
- `node --check` on `src/server.js`, `src/agents/orchestrator.js`, `src/settlement/vyperPolicy.js`, `src/keeperhub/client.js`, `public/main.js`
- Python 3.11: `pip install -r tests/titanoboa/requirements.txt` + `pytest tests/titanoboa -q`

## Debug telemetry

Shipped reference code should **not** POST to local ingest URLs. If you fork an older snapshot that still contains `127.0.0.1:7488` ingest calls, remove them for production-like builds.

## Acceptance checklist (must pass)

1. `npm start` serves UI and APIs on `PORT`.
2. UCP discovery + sample checkout + self-test work.
3. Agent session `tip_dancer` completes with trace including settlement proof when enabled.
4. Circle wallet create + ciphertext generate + transfer path works when env configured.
5. MetaMask chain switch + send works when treasury configured.
6. Tutorial lock/unlock + battle flows behave as specified.
7. U3/U6/U7/U8/U4/U10 flows are runnable from UI and return deterministic JSON records.
8. Agent capabilities include expanded intents (`judge_feedback_request`, `crew_split_settlement`, `practice_room_reserve`, `sample_pack_purchase`, `challenge_payout`, `merch_concierge_checkout`) and UI syncs dropdown from capabilities.
9. CI jobs pass.
10. With `KEEPERHUB_API_KEY` set: `/api/keeperhub/status` returns JSON (not HTML); `online-source-wallet` / `online-destination-gas` fund-hint routes return structured balances + gas guidance; optional demo transfer or U5 `execute_via_keeperhub` path returns structured `keeperhub` metadata on the payout or transfer response.
10b. Local KeeperHub Arc acceptance (explicit):
    - app uses `KEEPERHUB_API_BASE=http://localhost:3001/api`
    - `GET /api/keeperhub/status` shows `arc_supported: true` and `execute_network: "arc-testnet"`
    - `POST /api/keeperhub/execute-transfer` with `execution_mode: "local"` succeeds (completed execution + tx hash)
11. ENS workshop sanity flow passes:
    - guided UX path (`#ens-run-guided-flow`) completes ENS write + registry upsert + verify + resolve with visible progress chips and trust badges.
    - `GET /api/ens/resolve?...&registry=...&agentId=...` -> `POST /api/ens/verify-attestation` -> `POST /api/ens/setup-agent` demo preview (shows `ensip25Key` / `ensip25Value`) -> high-risk blocked before non-empty ENSIP-25 value -> high-risk allowed after write.
    - allowed run includes policy trace showing trust/privacy/versioning state.
    - include registry `contract_address=0xd4978db542eec50e225ad8441662e96ed75612a8` in docs/proof output.

---

END OF MEGA PROMPT
