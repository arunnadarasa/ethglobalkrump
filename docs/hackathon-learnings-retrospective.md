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

10. **Online execution architecture successfully pivoted to SDK**
   - Replaced custom Circle CCTP REST assumptions with Arc/Circle SDK flow using App Kit + Bridge Kit.
   - Kept existing execution-mode UX and KeeperHub destination payout contract intact.
   - Migration reduced endpoint fragility and aligned implementation with official docs.

11. **AIsa x402 probe flow was validated with runtime evidence**
   - `/apis/v2/openai/chat/completions` returned upstream `404` in probe mode and was removed as a default assumption.
   - `/apis/v2/perplexity/sonar` consistently returned `402` challenge responses in `x402_probe`, confirming expected challenge-detection behavior.
   - UI copy/defaults were aligned so sonar is used as convenience endpoint for probe runs while keeping mode label generic.

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
   - **`node --watch`** makes this worse: a failed bind leaves the watcher alive “waiting for file changes” instead of exiting, which hides that **3000** is still owned by another process.
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

10. **Runtime funding limits surfaced as the next blocker after migration**
   - After the SDK bridge migration, failures moved from "resource/path not found" to concrete balance constraints (e.g. insufficient Arc USDC).
   - This was healthier than the prior state: the system now fails for real economic reasons, not integration mismatches.

11. **Cross-system token assumptions caused KeeperHub execution failures**
   - Even when bridge and recipient-side balances were healthy, KeeperHub direct execution failed with `No token selected` and later `Insufficient USDC balance` in its own execution wallet context.
   - Root cause required proving destination-network token address and request shape independently from Circle bridge success.

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

10. **Prefer protocol SDKs over guessed REST surfaces for cross-chain flows**
   - For CCTP-style bridging, SDK abstraction (Arc App Kit / Bridge Kit) avoids brittle assumptions about private or evolving REST routes.
   - Keep domain errors explicit (`insufficient balance`, invalid recipient) so operators can act immediately.

11. **Bridge success does not imply downstream executor readiness**
   - Online execution has two balances to satisfy: source bridge wallet + executor wallet on destination (KeeperHub org wallet).
   - Instrumenting each stage (bridge, execute request, execution status) is essential to avoid chasing the wrong subsystem.

12. **Token selection should be network-explicit and runtime-verified**
   - Mapping USDC by destination network fixed misrouting from Arc token address to Base Sepolia token address.
   - A fallback retry without optional `tokenConfig` reduced API ambiguity and exposed true KeeperHub-side balance errors.

13. **Dynamic wallet UX must align with backend source-selection priority**
   - Syncing newly created Arc wallets into online-source runtime state removed wallet drift in the KeeperHub panel.
   - Showing source and destination balances in-context reduced operator confusion during live debugging.

14. **Signer-source transparency prevents false debugging loops**
   - Explicitly surfacing `destination_wallet` vs `source_wallet_fallback` in the UI removed ambiguity when source and destination addresses looked identical.
   - Unified EVM addressing can legitimately produce equal addresses across chains; this should be explained inline rather than treated as an error signal.

15. **x402 probe success criteria must be documented explicitly**
   - In probe mode, a `402` is a successful protocol signal, not a failed LLM request.
   - Teams need separate "challenge detected" vs "answer delivered" UX states to avoid confusion during live demos.
   - Facilitator/payment-client logic is only required for automatic paid retry after the challenge.

16. **External-settle handoff closes the answer gap without wallet custody**
   - Added `x402_external_settle` as a two-step route contract: challenge detection first, then replay with externally generated payment headers.
   - This keeps wallet signing outside the app while still enabling final answer retrieval from `/apis/v2/*`.

17. **Live paid x402 readiness depends on upstream settlement acceptance**
   - We confirmed Base wallet funding, Base ETH gas top-up, and successful on-chain `approve` + `deposit` transactions to gateway contracts.
   - Even with valid replay artifacts and signed Base challenge selection (`eip155:8453`), upstream continued to return `402` with `insufficient_balance` / `authorization_validity_too_short`.
   - Conclusion: the app integration is correct, but final paid-answer success still depends on upstream balance/accounting policy alignment.

18. **KeeperHub local Arc path reached fully successful execution**
   - Runtime was verified with `KEEPERHUB_API_BASE=http://localhost:3001/api`, `arc_supported: true`, and `execute_network: arc-testnet`.
   - Local `POST /api/keeperhub/execute-transfer` completed with tx `0xa5520fcd83734141a51cda1a4010b15d8983c573cab87b8239c3620158e58e08` on Arc testnet.
   - Practical win: local debug can be demonstrated as Arc-only (no CCTP dependency) while keeping online mode for cross-chain sponsor narrative.

19. **Separate local and online KeeperHub key routing avoids 401 drift**
   - `/chains` success alone was not enough; `/execute/transfer` in local KeeperHub enforces local-org key validation.
   - Supporting `KEEPERHUB_API_KEY_LOCAL` and `KEEPERHUB_API_KEY_ONLINE` (with legacy fallback) removed ambiguous auth behavior across environments.
   - This made environment switching deterministic for demo-day troubleshooting.

20. **Arc execute network must use stable slug, not internal chain row id**
   - Local chain list includes an opaque row id (e.g. `u93e...`) that is not accepted by `/execute/transfer`.
   - Resolving Arc to `arc-testnet` fixed "unsupported network" failures and restored end-to-end transfer completion.
   - Lesson: execute-network derivation should prioritize protocol-recognized slugs over persistence-layer identifiers.

21. **Online mode needs explicit base/key routing parity with execution mode**
   - We reproduced a mixed-routing bug where online transfer creation and execution-status lookup were sent to different KeeperHub bases.
   - Root cause: online execution path still used shared/local defaults in one code path while status checks used hosted defaults, producing `Execution not found` and `execution_status: null`.
   - Fix direction: enforce mode-aware base and key selection consistently for transfer creation + status fetch (`online` -> hosted base/key, `local` -> local base/key).

22. **Guided ENSIP-25 UX dramatically reduces operator error**
   - A one-click `Run ENSIP-25 setup (guided)` flow now sequences ENS write -> registry upsert -> trust verify -> resolve with visible progress chips.
   - Removing duplicate manual action buttons made the happy-path obvious during demos while preserving strict trust checks under the hood.
   - Split trust badges (`Spec`, `Registry`, `Bidirectional`) made failure diagnosis immediate.

23. **Bidirectional trust proof is now reproducible in-app**
   - Registry contract address used for backlink checks: `0xd4978db542eec50e225ad8441662e96ed75612a8` (Sepolia).
   - Upsert proof tx: `0xffb5e38c698d16d050cdbe31b5f779eaa5e171534c3a2ef3ac2e4cc1c608a8f1`.
   - Verify endpoint returns `ensip25_spec_verified=true`, `registry_side_verified=true`, `ensip25_bidirectional_verified=true` for matched ENS + agentId.

24. **Local dev server restarts must release the listen port first**
   - A second `node --watch src/server.js` while port **3000** is still held returns **`EADDRINUSE`**; the watcher then waits on “file changes” and looks broken even though the real issue is the socket.
   - Fix: stop the prior process (or free **3000**) before starting again; default URL stays **`http://localhost:3000`** when **`PORT`** is unset.

25. **KeeperHub `/execute/*` timeouts need staged evidence, not a single timer bit**
   - Logging **before fetch**, **after response headers**, **after body read**, and on **`AbortError`** distinguishes slow TLS/connect vs slow body vs true **`KEEPERHUB_REQUEST_TIMEOUT_MS`** deadline.
   - Battle **`declare-winner`** → **`executeTransferPayout`** benefits from the same lifecycle signals plus non-secret payload-shape hints when diagnosing **`keeperhub_timeout`** vs upstream errors.

26. **Local commerce Arc density is opt-in via env**
   - With **`execution_mode: local`**, Krump’s commerce routes default to **no** KeeperHub execution unless **`LOCAL_COMMERCE_ARC_TRANSFERS=true`** (and KeeperHub is configured). Without it, WOW beats still return **HTTP success** but **`arc_explorer_links`** only grows on paths that always hit KeeperHub (e.g. **U5 declare-winner**).
   - Turning the flag on plus restarting the server reproduces **nine commerce ArcScan rows + one prize payout row** when polling **`GET /api/keeperhub/executions/:executionId`** succeeds.

27. **Judge-visible progress needs two layers**
   - **Spine chips** (Battle seed → KeeperHub payout) stay coarse-grained for the deck story.
   - **Arc beats (live)** rows map **U5 entry**, **U1/U2/U3/U4/U6/U7/U8/U10**, and **U5 prize payout** with **Running… / On-chain / OK (no on-chain) / Failed** so operators see per-beat status without reading JSON.

28. **WOW commerce inputs belong in the UI, not only in code**
   - Prefilled, editable fields for each WOW beat avoid demo-only hardcoded literals and match what the runner POSTs (`clip_id`, crew JSON, challenge strings, etc.).

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
11. Add a funding preflight panel for online mode (source wallet balance + minimum required amount) before bridge execution.
12. Add a "demo payment rail" selector to all execution-only tools and keep response payloads echoing `payment_mode`/`payment_ref` for easier audit trails.
13. Add a KeeperHub execution-wallet preflight check endpoint to verify destination-network token availability/balance before calling `/execute/transfer`.
14. Persist dynamic online-source wallet choice across restarts (or explicit override policy) to avoid surprise source-wallet drift in demos.
15. Keep a one-click KeeperHub "Refresh balances" control so operators can re-check source/destination funding without opening faucet pages.
16. Pre-provision destination signer wallets for all target chains in demo environments to avoid fallback-mode confusion during judging.

17. **Document the two-wallet gas story in product copy, not only in logs**
   - Judges hit “mint failed” when **Circle bridge signer** POL was barely enough for pending txs; separately, **KeeperHub’s org executor** needs native gas for `/execute/transfer`.
   - Surfacing both in **API `instructions`**, **fund-hint** payloads (`keeperhub_executor_gas_hint`), and a **static KeeperHub funding reminder** in the UI reduced misdiagnosis (“RPC is down”) vs insufficient gas headroom.
22. **Separate "integration complete" from "upstream settlement accepted" in test criteria**
   - A successful engineering checkpoint for x402 is: challenge parse + replay artifact handoff + deterministic typed error surface.
   - A successful business/ops checkpoint is: upstream settlement acceptance for the funded wallet on the selected network.
23. **Funding on-chain was necessary but not sufficient for live x402 settlement**
   - We funded wallet `0xad52...FA51` on Base, added Base ETH gas, and executed successful on-chain `approve` + `deposit` txs to gateway contracts.
   - Paid calls still returned upstream `insufficient_balance`, indicating additional provider-side minimums/accounting conditions beyond local chain funding.
   - Action: escalate to AIsa support for exact minimum balance and accepted gateway ledger requirements per endpoint/network.

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
- Online bridge migration: custom CCTP REST calls replaced by Arc App Kit Bridge Kit + Circle Wallets adapter
- KeeperHub demo payment UX: now includes MetaMask/Circle/offchain payment mode selection with payment reference echoing in API output
- Online source wallet behavior: dynamic Arc wallet creation now syncs into KeeperHub online source selection path
- KeeperHub token routing: destination-network USDC token mapping added (Base/Ethereum/Arbitrum/Avalanche/Polygon testnets)
- KeeperHub execution reliability: resolved `No token selected` path with network token mapping + fallback request shape retry
- End-to-end online path: Circle payment receipt + Arc->Base bridge + KeeperHub transfer now reaches `execution_status: completed` with on-chain tx hash
- KeeperHub destination signer UX: source-vs-destination signer mode, wallet-id hints, and fallback warnings are now shown inline in the demo panel
- Multi-chain destination wallet provisioning: destination Circle wallets were provisioned for Base Sepolia, Ethereum Sepolia, Polygon Amoy, Arbitrum Sepolia, and Avalanche Fuji
- KeeperHub operator ergonomics: added "Refresh balances" action in panel to reload Arc source and destination signer funding state without launching faucets
- KeeperHub funding UX: persistent panel note to top up with **USDC + native token** for the **selected execution network**; destination gas API returns clearer **Circle signer vs org executor** instructions and executor gas hints
- KeeperHub local Arc execution: now confirmed end-to-end on local KeeperHub (`api_base=http://localhost:3001/api`, `execute_network=arc-testnet`) with successful on-chain transfer proof
- KeeperHub auth/network hardening: separate local/online API key routing and Arc execute-slug mapping prevent local `401`/unsupported-network false starts
- KeeperHub online/local split hardening: online path now reports hosted base in response context and keeps transfer/status routing aligned to avoid `execution_status: null` from cross-base lookups
- CCTP / Bridge Kit: Amoy and other destinations tunable via `POLYGON_AMOY_RPC_URL`, `POLYGON_AMOY_RPC_PUBLIC_FIRST`, `ALLOW_LOW_DESTINATION_GAS`, `ARC_BRIDGE_TRANSFER_SPEED`; per-chain recommended native minimums (e.g. Amoy **POL**) live in `src/settlement/cctpBridge.js`
- KeeperHub execute mapping: some destination networks require **numeric chain `network`** values on `/execute/transfer` (implemented in `src/keeperhub/client.js`) when string slugs are rejected upstream
- Debug hygiene: local `127.0.0.1` ingest telemetry removed from shipped KeeperHub client paths for cleaner production-style runs
- ENS judge UX is now explicit and operator-safe:
  - dynamic name ownership/status checks before registration (`/api/ens/name-status`)
  - signer Sepolia ETH check and shortfall cues (`/api/ens/signer-balance`)
  - write mode selector (`demo`, `circle_wallet`, `metamask`) with MetaMask proof signature in metamask mode
  - ENS input normalization (`.eth` suffix) and `agentId` autofill (`agent.<label>`)
  - in-flight timer + copy explaining expected commit→register wait for unowned names
- ENS resolver decoding hardened:
  - Universal Resolver multicall bytes are decoded into plain `addr` and text values
  - intent gating now evaluates plain `allowedIntents` values (no raw ABI blob mismatch)
- Wallet-source clarity completed in judge UX:
  - Sepolia ETH check now follows selected source wallet (`metamask` vs `circle_wallet`) instead of a fixed signer-only path
  - this removed operator confusion when Circle wallet had 0 ETH but signer wallet had funds (or vice versa)
- Final UX quality improvements landed:
  - long-running ENS setup status shows elapsed timer
  - ENS name status and registration-value cues are visible before write
  - bare ENS labels auto-normalize to `.eth`
  - `agentId` auto-helper (`agent.<ens-label>`) speeds setup while preserving manual override
- ENS workshop enhancement (v2) now ships in three lanes:
  - **Trust gate:** ENSIP-25 baseline text key `agent-registration[<registryERC7930>][<agentId>]` with non-empty value semantics, plus registry backlink verification for high-risk intents
  - **Privacy lane:** ENS-controlled payout mode (`public|privacy`) with privacy receiver fallback
  - **Version lane:** agent/capability version tags + optional compatible-intent enforcement
- Live sanity proof now reproducible in 5 calls:
  - `GET /api/ens/resolve` (include `registry` + `agentId` query params when not using server defaults) -> `POST /api/ens/verify-attestation` `{ ensName, intent, registry, agentId }` (check `ensip25_spec_verified` vs `ensip25_bidirectional_verified`) -> `POST /api/ens/setup-agent` demo preview (`ensip25Registry`, `ensip25AgentId`, `ensip25Value`) -> blocked high-risk on ENS-only proof -> allowed high-risk after registry backlink match
  - blocked path returns explicit trust-gate failure text
  - allowed path emits `ens_policy` trace with payout route + receiver in session events
- ETHGlobal hackathon UX: **9× Circle WOW** optional commerce loop with **editable WOW params**, **`arc_explorer_links`** + explorer list under JSON, **`LOCAL_COMMERCE_ARC_TRANSFERS`** for local Arc rows, and **Arc beats (live)** strip for per-track status + ArcScan hashes (confirmed working end-to-end with self-hosted KeeperHub on Arc testnet).
