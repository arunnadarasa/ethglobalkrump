# Krump x UCP MVP Demo

An ETHGlobal-ready app that turns Krump culture into programmable commerce using:

- Official Universal Commerce Protocol (UCP) stack (JS SDK + schema validation + conformance checks)
- Arc Testnet settlement rails
- Circle developer-controlled wallets and micropayment patterns

## Why this app is awesome

- Real creator economy flows, not toy examples: live tips, paid tutorials, and battle payouts.
- Dual rails by design: MetaMask on-chain and Circle wallet transfers in one UI.
- Built for demo-day reliability: onboarding UX, wallet save state, balance visibility, and funding cues.
- Built for auditability: incremental commits, explicit docs, and reproducible setup.
- Conformance-aware by design: schema-validated UCP endpoints and built-in self-test route.

## Contents

- `docs/krump-ucp-usecases.md` - 10 use cases, scoring model, rankings, and top 3 MVP tracks
- `docs/auditability-playbook.md` - Git audit workflow, AI attribution standards, and submission checklist
- `docs/hackathon-learnings-retrospective.md` - implementation learnings, wins, failures, and next steps

## Top 3 MVP Demo (Implemented)

This repo now includes a runnable prototype for the three prioritized tracks:

- `U1` Live Battle Micro-Tipping
- `U2` Pay-Per-Move Tutorial Unlock
- `U5` Battle Entry + Instant Prize Pool Payout

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

Sub-agents coordinate internally (agent-to-agent), but only the payments sub-agent executes checkout and order calls via the existing UCP response builders.

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
- `src/agents/orchestrator.js` - in-repo H2A/A2H/A2A session orchestration
- `src/settlement/vyperPolicy.js` - deep settlement policy evaluator (Node-side mirror)
- `src/state.js` - in-memory demo state and helper utilities
- `public/index.html` - single-page demo UI
- `public/main.js` - client interactions, wallet rails, onboarding, and balances
- `public/styles.css` - app styling
- `contracts/` - Vyper contracts used for settlement policy proofs
- `tests/titanoboa/` - Titanoboa-based contract tests

## Wallet Rails

Each interactive flow now supports three modes:

- `MetaMask on-chain` - sends transaction from browser wallet and records tx hash
- `Circle wallet` - server-initiated transfer with wallet ID + required Circle secret material
- `Offchain demo only` - fallback simulation mode for fast demos

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

## Demo highlights

- U1 tips settle through selectable rails and update leaderboard in real time.
- U2 keeps content locked behind payment and returns unlock tokens for access.
- U5 registers entrants, closes rounds, and computes winner payout paths.
- Circle and MetaMask balances are visible in the same demo for operational confidence.
- Official UCP discovery/checkout/order responses are exposed with schema-backed validation.
