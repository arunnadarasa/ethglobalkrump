# ETHGlobal Auditability Playbook

This playbook ensures the project is clearly compliant with hackathon audit expectations (incremental work history, transparency, and reproducibility).

## 1) Commit Cadence

Use small, verifiable commits throughout the build:

1. `chore: initialize hackathon repo scaffold`
2. `docs: add use-case ranking and scoring model`
3. `feat: add ucp profile discovery endpoint`
4. `feat: implement circle nanopayment buyer flow`
5. `feat: implement seller-side payment-required middleware`
6. `feat: wire arc testnet settlement/payout mock`
7. `feat: add demo UI for tipping/tutorial unlock`
8. `test: add end-to-end payment and unlock checks`
9. `docs: add architecture, setup, and runbook`
10. `docs: add AI attribution and final submission notes`

Rules:

- Commit at least every 45-90 minutes during active development.
- Keep each commit focused on one concern (docs, backend, frontend, integration, tests).
- Do not squash local history before submission; chronological evidence is useful.

## 2) Branching Model

- `main`: stable demo branch for final recording.
- feature branches per module:
  - `feat/ucp-core`
  - `feat/circle-nanopayments`
  - `feat/arc-settlement`
  - `feat/demo-ui`
  - `docs/submission`

Open PRs even in a solo workflow for audit trail and discussion notes.

## 3) Required Documentation Artifacts

Create and maintain:

- `README.md` with problem, solution, stack, setup, demo instructions (including **sponsor** flows: KeeperHub, Bridge Kit online mode, env tuning).
- `docs/krump-ucp-usecases.md` with rationale and scope boundaries.
- `docs/lovable-mega-prompt.md`, `docs/lovable-landing-page.md`, `docs/pitch-slide-deck.md`, and `docs/hackathon-learnings-retrospective.md` updated when UX or integration contracts change (judges often read these alongside the repo). Include ETHGlobal hackathon flow changes: **9× Circle WOW**, **Arc beats (live)** strip, **`LOCAL_COMMERCE_ARC_TRANSFERS`**, **`GET /api/keeperhub/executions/:executionId`**, and **`arc_explorer_links`** in printed JSON.
- `docs/architecture.md` with sequence flow and component responsibilities.
- `docs/demo-script.md` for 2-4 minute walkthrough.
- `docs/partner-prize-mapping.md` mapping features to prize criteria.

## 4) AI Usage Attribution

Add `docs/ai-attribution.md` with:

- Tools used (Cursor, LLM model names, Copilot, etc.).
- Where AI helped (files/functions/features).
- What humans decided/implemented manually.
- Review and validation steps done by team.

Recommended template:

```md
# AI Attribution

## Tools Used
- Cursor (planning, code scaffolding, refactors)

## AI-Assisted Areas
- `src/payments/x402Middleware.ts`: initial middleware scaffold
- `docs/demo-script.md`: first draft

## Human Contributions
- Final architecture decisions
- Security review and edge-case handling
- UI/UX iteration and final code acceptance

## Validation
- Manual integration tests on testnet
- Peer review before merge
```

## 5) Submission Readiness Checklist

- [ ] Repo contains iterative commit history from hackathon period.
- [ ] Demo video is 2-4 minutes, 720p or higher, voice narration by team.
- [ ] Up to 3 partner prizes selected and explicitly justified.
- [ ] AI usage documented with file-level attribution.
- [ ] Any reused code/assets are clearly labeled.
- [ ] Setup steps reproduce demo on a fresh machine.
- [ ] All required links (repo, demo video, optional design files) are validated.

## 6) Demo Packaging Checklist (Judge-Facing)

- [ ] 20-second problem setup.
- [ ] 2-3 minute product flow showing real user value.
- [ ] Show UCP interoperability point, not just UI.
- [ ] Show Circle nanopayment event and settlement evidence.
- [ ] Show Arc testnet transaction/reference evidence.
- [ ] 20-second close with impact and go-to-market.

## 7) Suggested Repo Hygiene Commands

Run before recording and submission:

- `git log --oneline --decorate --graph -n 30`
- `git status`
- `npm test` or project test command
- `npm run build` or project build command

These commands help ensure history clarity and functional readiness.
