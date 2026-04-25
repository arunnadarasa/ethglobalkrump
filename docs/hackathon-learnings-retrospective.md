# ETHGlobal Krump x UCP Retrospective

## Context

This project implemented a hackathon demo for Krump Dance commerce using:

- UCP-inspired commerce flows (tips, tutorial unlocks, battle entry/payout)
- Arc Testnet as settlement network
- Dual payment rails (MetaMask and Circle developer-controlled wallets)
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

## Outcome Snapshot

- MVP tracks: implemented and runnable
- MetaMask rail: integrated
- Circle rail: integrated with wallet onboarding UX
- Circle wallet creation blocker: resolved through fresh ciphertext strategy
- UX funding guidance: added with direct faucet path
