# Krump Protocol Agents — Hackathon learnings (Krump x UCP)

## Context

This project implemented **Krump Protocol Agents**, a hackathon demo for Krump dance commerce using:

- Official **UCP** stack (`@ucp-js/sdk`: discovery, checkout, order, conformance self-test)
- **Arc Testnet** as the primary settlement network narrative
- Dual payment rails (**MetaMask** and **Circle** developer-controlled wallets)
- Optional **Vyper** settlement policy + deployed Arc contract for credibility
- In-repo **agent orchestration** (H2A / A2A / A2H) with session traces
- **KeeperHub** ([OpenAgents sponsor](https://ethglobal.com/events/openagents/prizes)) as an optional execution layer for Arc testnet transfers (demo form + U5 winner payout path)
- Strict auditability expectations (frequent commits, reproducible steps, AI attribution)

## What Worked Well (Successes)

1. **Top 3 MVP tracks shipped quickly**
   - U1 live micro-tipping, U2 pay-per-move unlocks, and U5 battle entry + payout all run end-to-end.
   - A single demo UI keeps each flow easy to test live during judging.

2. **Dual payment rails reduced delivery risk**
   - MetaMask on-chain rail provided transparent transaction UX.
   - Circle rail enabled controlled backend settlement behavior and wallet programmability.
   - Runtime config endpoint made environment-driven switching easier during debugging.

3. **Arc Testnet alignment improved reliability**
   - Correct testnet defaults were set and surfaced in UI/server config.
   - Environment examples were updated with more precise guidance.

4. **Circle wallet onboarding became usable from UX**
   - Wallet creation can be triggered directly from UI.
   - Added UX support for saving wallet details (wallet ID + address) and funding guidance.
   - Added clear faucet cue for Arc Testnet funding via [Circle Faucet](https://faucet.circle.com/).

5. **Debug-first workflow resolved critical blockers**
   - Hypothesis-driven instrumentation made API failures reproducible and explainable.
   - Wallet creation success was verified with runtime evidence, not assumptions.

6. **Circle tip resilience improved after restart edge cases**
   - Tip flow now resolves wallet identity from UI/request state, not only process memory.
   - Transfer payloads include required secret material in the expected Circle format.
   - Result: Circle wallet tipping recovered from restart-related regressions.

7. **Operational visibility improved in UX**
   - Added wallet balance panel for quick runtime checks.
   - Kept wallet onboarding and funding guidance close to payment controls.
   - Reduced demo friction for judges and operators.

8. **Official UCP integration was operationalized**
   - Added `@ucp-js/sdk` and wired schema validation directly in API handlers.
   - Exposed UCP discovery, checkout, and order-style endpoints in the same app.
   - Added a conformance self-test endpoint for fast protocol sanity checks.

9. **KeeperHub sponsor integration stayed additive**
   - REST client in `src/keeperhub/client.js`: chains discovery, direct `POST /execute/transfer`, execution status.
   - UI section plus U5 checkbox; `declare-winner` accepts `execute_via_keeperhub` without breaking the off-chain payout record.

## What Failed / Pain Points

1. **Repository assumption mismatch**
   - Earlier prompts assumed scripts/endpoints that did not exist in this repo.
   - This caused avoidable failed runs before discovery-first checks were enforced.

2. **Circle secret model caused repeated confusion**
   - `CIRCLE_ENTITY_SECRET_RAW` vs `CIRCLE_ENTITY_SECRET_CIPHERTEXT` was easy to misinterpret.
   - Developers expected static ciphertext reuse to work, but Circle requires fresh ciphertext per sensitive call.

3. **Ciphertext reuse failures in multi-step flows**
   - Creating wallet sets and wallets in one flow initially reused ciphertext, returning 400 errors.
   - Fix required generating distinct fresh ciphertexts for each call in the flow.

4. **Input format errors for entity secret**
   - Incorrect secret format triggered RSA encryption errors (`data too large for key size`).
   - Needed strict normalization (32-byte secret from hex or base64) before encryption.

5. **Environment and shell friction during setup**
   - Port collisions (`EADDRINUSE`) and shell syntax differences (`zsh` vs `bash`) slowed iteration.
   - Endpoint naming mismatches (expected vs actual) caused temporary dead ends.

6. **State split between UI and backend caused payment drift**
   - Wallet created and saved in UI did not always persist as active runtime state after backend restart.
   - This mismatch triggered false "missing credentials" errors even with valid keys.

7. **Circle transfer payload requirements were stricter than expected**
   - Transfer calls failed when `entitySecretCiphertext` was absent, even when other credentials were present.
   - Generic "API parameter invalid" errors required deeper payload-level inspection.

8. **Official SDK packaging quirks required care**
   - ESM import path issues appeared in direct dynamic import attempts.
   - CommonJS `require()` path worked reliably for server-side integration in this stack.

9. **KeeperHub API base and key type confusion**
   - Setting `KEEPERHUB_API_BASE` to `https://app.keeperhub.com` (missing `/api`) produced **HTML 404** responses because requests hit `/chains` instead of `/api/chains`. The client now normalizes that case.
   - **Organization keys (`kh_`)** are required for REST and direct execution; **user webhook keys (`wfb_`)** are for workflow webhooks only — using `wfb_` in `KEEPERHUB_API_KEY` fails with an explicit error.
   - Local self-hosted `/api/chains` may return a **top-level array** instead of `{ data: [...] }`; strict parsers can silently produce empty chain lists and false `arc_supported: false`.

## Key Learnings

1. **Discovery-first beats assumption-first**
   - Validate scripts, endpoints, and env contract in-code before implementing fixes.

2. **Dynamic secret handling is mandatory for Circle workflows**
   - Fresh ciphertext generation must be treated as part of normal wallet operations.

3. **Validation early prevents costly retries**
   - Secret format validation at input boundaries avoids cryptographic runtime failures downstream.

4. **Auditability benefits from small, intention-revealing commits**
   - Frequent commits mapped to one problem/fix improved traceability and rollback confidence.

5. **UX should surface operational next steps**
   - Showing wallet identifiers and faucet instructions directly in UI reduced operator mistakes.

6. **Persistence and process state must be bridged explicitly**
   - Frontend-saved wallet context should be passed to backend transfer routes to survive restarts.

7. **Instrument payload shape, not just success/failure**
   - Logging key presence (not secrets) on outbound payloads quickly revealed missing required fields.

8. **Conformance should be continuously checkable**
   - A lightweight self-test endpoint catches schema drift faster than manual endpoint checks.

9. **Sponsor REST integrations need the same discovery discipline as Circle**
   - Read upstream docs for **base URL**, **auth header** (Bearer vs `X-API-Key` on execute routes), and **key scope** before debugging “mystery HTML” errors.
   - Normalize and validate response shapes at integration boundaries (`[]` vs `{data:[]}`) to avoid false-negative capability checks.

## Practical Recommendations for Next Iteration

1. Add a dedicated onboarding state card (created, funded, ready-to-pay).
2. Add a wallet health check endpoint (balance + token readiness) and surface it in UI.
3. Add integration tests for Circle onboarding paths:
   - with existing `walletSetId`
   - without `walletSetId`
   - with raw secret
   - with generated ciphertext
4. Add a short runbook for demo-day recovery (ports, env sanity checks, payment fallback mode).
5. Keep a strict "no secret logging" policy while preserving high-signal operational logs.
6. Add a lightweight startup sync endpoint to set active wallet from last saved onboarding result.
7. Add transfer preflight checks in UI (wallet selected, token selector present, destination configured).
8. Add CI step to call `/api/ucp/conformance/self-test` and fail fast on schema regressions.
9. Add sample UCP request/response fixtures under `docs/` for judge walkthroughs.
10. Document KeeperHub org wallet funding and `KEEPERHUB_EXECUTE_NETWORK` once Arc slug is confirmed from live `GET /api/chains`.

## Outcome Snapshot

- MVP tracks: implemented and runnable
- MetaMask rail: integrated
- Circle rail: integrated with wallet onboarding UX
- Circle wallet creation blocker: resolved through fresh ciphertext strategy
- UX funding guidance: added with direct faucet path
- Wallet balances: visible in app for MetaMask and Circle wallets
- Circle tip transfer reliability: fixed for restart and payload-validation edge cases
- Official UCP SDK/schema integration: enabled with discovery/checkout/order and self-test routes
- KeeperHub (OpenAgents): optional Arc execution (`/api/keeperhub/*`, U5 checkbox, `kh_` org key); README and `.env.example` document setup
- KeeperHub local compatibility hardening: `/chains` parser now accepts both root-array and wrapped-data shapes, restoring correct Arc detection in status + chains views
