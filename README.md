# Krump Protocol Agents

Krump x UCP MVP Demo.

An ETHGlobal-ready app that turns Krump culture into programmable commerce using:

- Official Universal Commerce Protocol (UCP) stack (JS SDK + schema validation + conformance checks)
- Arc Testnet settlement rails
- Circle developer-controlled wallets and micropayment patterns
- Optional [KeeperHub](https://docs.keeperhub.com/api) direct execution on Arc (ETHGlobal [OpenAgents](https://ethglobal.com/events/openagents/prizes) sponsor track)

## Why this app is awesome

- Real creator economy flows, not toy examples: live tips, paid tutorials, and battle payouts.
- Dual rails by design: MetaMask on-chain and Circle wallet transfers in one UI.
- Optional KeeperHub layer for reliable on-chain transfers (demo + U5 payout) without replacing UCP or Circle as the commerce core.
- Built for demo-day reliability: onboarding UX, wallet save state, balance visibility, funding cues, and **KeeperHub online** guidance (USDC + native gas on the selected chain, plus org executor hints).
- Built for auditability: incremental commits, explicit docs, and reproducible setup.
- Conformance-aware by design: schema-validated UCP endpoints and built-in self-test route.

## Contents

- `docs/krump-ucp-usecases.md` - 10 use cases, scoring model, rankings, and top 3 MVP tracks
- `docs/auditability-playbook.md` - Git audit workflow, AI attribution standards, and submission checklist
- `docs/hackathon-learnings-retrospective.md` - implementation learnings, wins, failures, and next steps
- `docs/pitch-slide-deck.md` - short slide outline and demo script for judges
- `docs/lovable-landing-page.md` - marketing-style one-pager for the product
- `docs/lovable-mega-prompt.md` - full rebuild spec for tools such as Lovable
- `docs/cursor-mega-prompt-self-hosted-keeperhub-arc.md` - Cursor mega prompt to fork KeeperHub open source and add Arc testnet for local linking to this app

## Use Cases Implemented

This repo now includes runnable API + UI flows for:

- `U1` Live Battle Micro-Tipping
- `U2` Pay-Per-Move Tutorial Unlock
- `U3` Judge Feedback Marketplace
- `U4` Crew Revenue Split Wallet (simulated split settlements)
- `U5` Battle Entry + Instant Prize Pool Payout
- `U6` Pay-Per-Session Practice Room Booking
- `U7` Krump Sample Pack Licensing
- `U8` Skill Challenges with Sponsor Bounties
- `U10` Agent-Based Merch Concierge

## Official UCP Integration (Now Live)

This app now integrates the official UCP stack in Node via `@ucp-js/sdk` and validates payloads using canonical schemas.

### UCP API Routes

- `GET /api/ucp/discovery` - returns discovery profile with capabilities + REST service metadata
- `POST /api/ucp/checkout/create` - validates request with `CheckoutCreateRequestSchema` and returns UCP checkout response
- `GET /api/ucp/orders/:orderId` - returns UCP order-style status response
- `GET /api/ucp/conformance/self-test` - runs local schema validation checks for checkout/order artifacts

### Conformance Notes

- Runtime validation is performed through official UCP SDK schemas.
- Invalid checkout payloads are rejected with a typed UCP validation error path.
- The self-test endpoint is intended for quick demo-day confidence checks.

## Agent Orchestration (Now Live)

This app now supports in-repo agent orchestration while keeping UCP as the commerce core:

- `POST /api/agents/sessions` - runs intent-driven human-to-agent sessions
- `GET /api/agents/sessions/:sessionId` - fetches agent trace for agent-to-human visibility
- `GET /api/agents/capabilities` - returns supported intents and sub-agent model
- `GET /api/agents/identity` - returns ERC-8004 style identity metadata configured in env

Sub-agents coordinate internally (agent-to-agent), but only the payments sub-agent executes checkout and order calls via the existing UCP response builders.

### ENS Agent Identity (Sepolia writes, Universal Resolver reads)

The app can use **ENS** as the human-readable identity layer for agent sessions.

- `POST /api/agents/sessions` accepts `context.agent_ens_name` (e.g. `my-agent.eth`)
- the server resolves `agent_ens_name` via the ENS **Universal Resolver** using the configured Sepolia RPC
- the resolved values are injected into the session trace identity and used to gate intents:
  - if ENS text record `allowedIntents` is set, only those intents can run
- when deep settlement is enabled, the resolved ENS address is also used as the `agentId` input for the Vyper settlement policy evaluation (so ENS identity becomes part of policy enforcement).

#### ENS records to set (on the ENS resolver)
Write these records on **Ethereum Sepolia**:

- `addr` record (coin=60 == ETH) set to the Arc actor EVM address:
  - in the app this is treated as the “agent actor address” used inside the Arc testnet settlement policy flow
- text records (keys):
  - `agentId` (string; appears in session identity metadata)
  - `tokenUri` (string)
  - `capabilitiesUri` (string)
  - `allowedIntents` (string; comma-separated or JSON array of allowed intent ids)
  - `arcAddress` (optional override; if set, the app prefers it over the addr record)

#### Setup script

Use the helper to register/update a name and set resolver + records on Sepolia:

```sh
ENS_SEPOLIA_RPC_URL=https://rpc.sepolia.org \
ENS_PRIVATE_KEY=0x... \
ENS_NAME=my-agent.eth \
AGENT_ARC_ADDRESS=0x... \
ENS_AGENT_ID=agent-1 \
ENS_TOKEN_URI=https://... \
ENS_CAPABILITIES_URI=https://... \
ENS_ALLOWED_INTENTS=tip_dancer,battle_entry \
node scripts/ens/setup-agent-ens.mjs
```

#### How resolution works for Arc flows

Even though KeeperHub and the settlement narrative use **Arc testnet**, the ENS resolution itself is performed against **Sepolia** (where ENS contracts live). The resolved 0x address returned by ENS is then used as the identity/policy actor address within the Arc testnet and online KeeperHub flows.

### OpenClaw note

OpenClaw is optional for this MVP. The current implementation is OpenClaw-compatible by design (session traces + delegated sub-agents), and can later be connected through an external OpenClaw gateway adapter without changing UCP routes.

## Vyper Deep Settlement Slice

This repo now includes a Vyper policy contract and Titanoboa tests for deep settlement checks while preserving UCP as the primary commerce protocol.

- Contract: `contracts/AgentSettlementPolicy.vy`
- Tests: `tests/titanoboa/test_agent_settlement_policy.py`
- Python deps: `tests/titanoboa/requirements.txt` (includes `circle-titanoboa-sdk`)

### Runtime toggle

When `ENABLE_VYPER_SETTLEMENT=true`, the app enforces policy checks before Circle transfer execution and also in the agent payments flow:

- `POST /api/settlement/vyper/evaluate` - manual policy evaluation endpoint
- `GET /api/agents/capabilities` - includes `settlement_mode`

If disabled, default Circle/UCP demo behavior remains active for maximum reliability.

### ERC-8004 style identity metadata

When configured, agent sessions include identity metadata and emit a dedicated identity trace event:

- `ERC8004_AGENT_REGISTRY`
- `ERC8004_AGENT_ID`
- `ERC8004_AGENT_TOKEN_URI`
- `ERC8004_AGENT_CAPABILITIES_URI`

### Optional deploy to Arc

Use the helper script to deploy the Vyper policy contract:

1. Set env:
   - `ARC_RPC_URL`
   - `DEPLOYER_PRIVATE_KEY`
2. Run:
   - `python3 scripts/deploy_vyper_policy.py`
3. Copy deployed address into:
   - `VYPER_SETTLEMENT_CONTRACT`

### Arc deployment proof (bonus credibility)

- Network: Arc testnet (`chainId` `0x4cef52`)
- Contract: `0xEb5c12779Ac3E7623645B0519F25E0924Fc58ea7`
- Deploy tx: `0x5a1601efa89da876cfbf0dc3ff989306483cf6cc37d11d95a150e6b22877f93a`
- Owner: `0x3fce8a30a63A024eb41156344c1818fa1aB57133`

The runtime can enforce this by setting `ENABLE_VYPER_SETTLEMENT=true` and `VYPER_SETTLEMENT_CONTRACT` to the deployed address.

### Demo-safe fallback

If testnet RPC or key issues appear close to demo time, set `ENABLE_VYPER_SETTLEMENT=false` temporarily. Keep the deployment proof above in submission notes and continue demoing on UCP core + Circle rails.

### Local Run

1. Install dependencies:
   - `npm install`
2. Copy env template and fill values:
   - `cp .env.example .env`
3. Start the app:
   - `PORT=8787 npm start`
4. Open:
   - `http://localhost:8787`

### Project Structure

- `src/server.js` - Express API for tracks, Circle rails, and official UCP endpoints
- `src/settlement/cctpBridge.js` - Arc → destination testnet USDC bridge via Circle **Bridge Kit** / App Kit (online execution)
- `src/keeperhub/client.js` - KeeperHub REST client (chains discovery + direct execution transfers; numeric `network` IDs for select online chains)
- `src/agents/orchestrator.js` - in-repo H2A/A2H/A2A session orchestration
- `src/settlement/vyperPolicy.js` - deep settlement policy evaluator (Node-side mirror)
- `src/state.js` - in-memory demo state and helper utilities
- `public/index.html` - single-page demo UI
- `public/main.js` - client interactions, wallet rails, onboarding, and balances
- `public/styles.css` - app styling
- `contracts/` - Vyper contracts used for settlement policy proofs
- `tests/titanoboa/` - Titanoboa-based contract tests
- `scripts/deploy_vyper_policy.py` - optional Arc deployment helper for Vyper policy

## Wallet Rails

Each interactive flow now supports three payment rail modes:

- `MetaMask on-chain` - sends transaction from browser wallet and records tx hash
- `Circle wallet` - server-initiated transfer with wallet ID + required Circle secret material
- `Offchain demo only` - fallback simulation mode for fast demos

In addition, every payment-bearing flow now supports per-request execution strategy:

- `execution_mode: local` - keep execution on Arc testnet path
- `execution_mode: online` - bridge USDC from Arc testnet (CCTP) and execute transfer on selected KeeperHub-supported testnet
- `execution_network` choices:
  - `ethereum-sepolia`
  - `base-sepolia`
  - `polygon-amoy`
  - `arbitrum-sepolia`
  - `avalanche-fuji`

## Circle Wallet Onboarding UX

The app includes first-class onboarding so operators can configure and run flows quickly:

- Create Circle wallet from UI
- Generate fresh entity secret ciphertext when needed
- Save wallet details locally for reuse
- Display wallet ID/address with direct funding cue via [Circle Faucet](https://faucet.circle.com/)
- Refresh wallet balances in-app (MetaMask and Circle sections)

### Circle setup

Put your Circle credentials in `.env`:

- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET`
- `CIRCLE_WALLET_ID`
- `CIRCLE_WALLET_SET_ID` (optional; app can auto-create if omitted)
- `CIRCLE_TOKEN_ID` (preferred) **or** `CIRCLE_TOKEN_ADDRESS` + `CIRCLE_TOKEN_BLOCKCHAIN`
- `CIRCLE_DESTINATION_ADDRESS`
- `CIRCLE_ENTITY_SECRET_RAW` (recommended for generating fresh ciphertext)
- `CIRCLE_ENTITY_SECRET_CIPHERTEXT` (fallback, if raw is unavailable)

If your Circle account uses a different transfer endpoint, update:

- `CIRCLE_TRANSFER_PATH`

### MetaMask setup

Set these in `.env` so the UI can switch/add chain and send tx:

- `ARC_CHAIN_ID`
- `ARC_CHAIN_NAME`
- `ARC_RPC_URL`
- `ARC_NATIVE_SYMBOL`
- `ONCHAIN_TREASURY_ADDRESS`

## KeeperHub (OpenAgents sponsor integration)

This project uses **UCP + Circle + Arc** as the commerce spine. [KeeperHub](https://docs.keeperhub.com/api) is integrated as an **optional execution layer**: direct transfers on Arc testnet for demos and for the **U5 winner payout** path when you opt in.

### Why this fits the hackathon

The [OpenAgents KeeperHub prize](https://ethglobal.com/events/openagents/prizes) rewards reliable onchain execution for agents (including payment-rail adjacency such as x402/MPP in their materials). Here, KeeperHub executes the **token transfer** leg after your app has already computed the pool and winner, without replacing UCP checkout or Circle wallet flows.

### Setup

1. Create an **organization API key** (`kh_…`) in [KeeperHub](https://app.keeperhub.com/) under Settings → API Keys → **Organisation** (see [API keys](https://docs.keeperhub.com/api/api-keys)). User-scoped **webhook** keys (`wfb_…`) are only for workflow webhook URLs in KeeperHub’s docs — **do not** put a `wfb_` key in `KEEPERHUB_API_KEY`; this app’s REST and direct-execution calls require `kh_`.
2. Add to `.env` (never commit the real key):

   - `KEEPERHUB_API_KEY` — required for any KeeperHub call (`kh_…` only)
   - `KEEPERHUB_API_BASE` — optional, default `https://app.keeperhub.com/api` (must include `/api`; if you omit it, the client normalizes `https://app.keeperhub.com` to the default)
   - `KEEPERHUB_EXECUTE_NETWORK` — optional; if Arc testnet (`ARC_CHAIN_ID`, default `5042002`) is listed under `GET /api/chains` but direct execution expects a different `network` string, set it explicitly (see [Direct execution](https://docs.keeperhub.com/api/direct-execution))
   - `KEEPERHUB_TOKEN_ADDRESS` — optional; defaults to `CIRCLE_TOKEN_ADDRESS` for USDC-style ERC-20 transfers. Leave unset only if you intend a **native** transfer on that network.
   - `KEEPERHUB_TOKEN_DECIMALS` / `KEEPERHUB_TOKEN_SYMBOL` — optional metadata for non-standard tokens (defaults `6` / `USDC`)

3. In KeeperHub, ensure your **organization wallet / spending** is configured for Arc testnet so `POST /execute/transfer` succeeds (see KeeperHub wallet docs if you hit `422`).

### API routes (this repo)

- `GET /api/keeperhub/status` — whether a key is set, whether Arc appears in KeeperHub’s chain list, and the resolved execute `network` slug when possible
- `GET /api/keeperhub/chains` — proxied chain list (auth: Bearer `kh_…`, per [Authentication](https://docs.keeperhub.com/api/authentication))
- `POST /api/keeperhub/execute-transfer` — body `{ recipient_address, amount_minor, execution_mode, execution_network }`; local mode uses Arc execution directly, online mode runs **Circle Bridge Kit** CCTP from Arc then [KeeperHub transfer](https://docs.keeperhub.com/api/direct-execution) on the selected target network
- `POST /api/keeperhub/online-source-wallet/fund-hint` — resolves/creates the Arc online source wallet and returns wallet address + faucet hint to fund bridge source USDC
- `POST /api/keeperhub/online-destination-gas/fund-hint` — body `{ execution_network }`; returns destination signer address, **native + USDC** balances, `signer_native_min_recommended`, `keeperhub_executor_gas_hint` (short and long variants), `instructions` (fund Circle **bridge signer** for CCTP mint gas **and** KeeperHub **organization executor** for the USDC payout leg), and chain faucet URL when applicable
- `POST /api/battle/declare-winner` — optional body flag `execute_via_keeperhub: true` with the same semantics as the UI checkbox (pushes pool to winner wallet via KeeperHub when configured)
- `GET /api/execution/networks` — supported execution modes and online destination networks

### Online bridge tuning (`.env`)

Documented in `.env.example` alongside KeeperHub:

- `POLYGON_AMOY_RPC_URL` — optional dedicated Amoy RPC when public endpoints are flaky during mint
- `POLYGON_AMOY_RPC_PUBLIC_FIRST` — order public vs custom Amoy RPCs for Bridge Kit (`true` by default)
- `ALLOW_LOW_DESTINATION_GAS` — when `true`, allows attempting the bridge even if destination native balance is below the **recommended** minimum (use for debugging only)
- `ARC_BRIDGE_TRANSFER_SPEED` — `FAST` or `SLOW` for Bridge Kit attestation pacing

Per-chain **recommended minimum native gas** for the Circle signer (before CCTP mint) is defined in `src/settlement/cctpBridge.js` (e.g. Polygon Amoy uses **POL** with a small floor for pending-tx headroom).

### UI

- **KeeperHub** section: status, chain list, and a small **demo transfer** form (minor units match the rest of the app: `amount_minor / 100` is the human token amount sent to KeeperHub).
- **Funding reminder** (above the operator buttons): prompts operators to top up KeeperHub-related wallets on the **selected execution network** with **USDC** and that chain’s **native gas** (e.g. POL on Polygon Amoy).
- **KeeperHub** section includes **Fund online source (Arc USDC)** to copy the exact source wallet address and open [Circle Faucet](https://faucet.circle.com/) before online bridging.
- **Fund destination gas wallet** refreshes destination signer balances and surfaces a **gas readiness** chip that distinguishes **Circle bridge signer** native balance from the separate **KeeperHub org executor** gas requirement (see API hints above).
- Every payment action now includes `Execution local|online` selector and destination network selector for online mode.
- **U5**: checkbox **Execute winner payout on-chain via KeeperHub** on declare winner.

### Agent capabilities

`GET /api/agents/capabilities` includes `keeperhub_execution: true` when `KEEPERHUB_API_KEY` is set.

### Submission and feedback

KeeperHub’s prize page asks for a demo, public repo with README, and a short write-up of how KeeperHub is used. Optionally compete for the **Builder Feedback Bounty** on the same page by documenting concrete UX, docs, bugs, or feature requests from your integration.

## Demo highlights

- U1 tips settle through selectable rails and update leaderboard in real time.
- U2 keeps content locked behind payment and returns unlock tokens for access.
- U3 runs a judge-feedback lifecycle with upfront payment intent and delivery/complete states.
- U4 records deterministic crew split ledgers from one payment event.
- U5 registers entrants, closes rounds, and computes winner payout paths (optional on-chain payout via KeeperHub when configured).
- U6 reserves, starts, and settles practice rooms from planned to final minutes.
- U7 issues sample pack license artifacts and verifies entitlement tokens.
- U8 supports sponsor challenge creation, submissions, scoring, and winner payout records.
- U10 provides merch recommendations and checkout records through an agent-friendly flow.
- Circle and MetaMask balances are visible in the same demo for operational confidence.
- Official UCP discovery/checkout/order responses are exposed with schema-backed validation.
- KeeperHub status/chains and demo transfer UI exercise the sponsor integration without changing UCP semantics.
- Online path: Arc USDC → Bridge Kit CCTP → destination testnet → KeeperHub USDC payout, with operator-visible balance and gas guidance.

## Additional API surface

- U3: `GET /api/judge-feedback`, `POST /api/judge-feedback/requests`, `POST /api/judge-feedback/:requestId/deliver`, `POST /api/judge-feedback/:requestId/complete`
- U6: `GET /api/practice-rooms`, `GET /api/practice-bookings`, `POST /api/practice-bookings/reserve`, `POST /api/practice-bookings/:bookingId/start`, `POST /api/practice-bookings/:bookingId/end`
- U7: `GET /api/sample-packs`, `POST /api/sample-packs/:packId/purchase`, `POST /api/sample-packs/licenses/verify`
- U8: `GET /api/challenges`, `POST /api/challenges`, `POST /api/challenges/:challengeId/submit`, `POST /api/challenges/:challengeId/score`, `POST /api/challenges/:challengeId/payout`
- U4: `GET /api/crews`, `POST /api/crews`, `POST /api/crews/:crewId/split-settlement`
- U10: `GET /api/merch/catalog`, `POST /api/merch/concierge/recommend`, `POST /api/merch/checkout`
