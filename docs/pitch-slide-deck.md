# Krump Protocol Agents - Pitch Deck

## Slide 1 - Title

**Krump Protocol Agents**  
Human to Agent. Agent to Agent. Agent to Human.  
UCP at the core, Vyper credibility on Arc.

Speaker note: We built an agent-native commerce system where AI coordination and protocol-compliant payments work together in one demo-ready stack.

---

## Slide 2 - The Problem

- Creator payments are fragmented and opaque.
- Agent demos usually skip payment reliability.
- Payment demos usually skip autonomous coordination.
- Judges need both novelty and execution proof.

Speaker note: Existing solutions force a tradeoff between agent intelligence and payment trust. We remove that tradeoff.

---

## Slide 3 - Our Solution

- UCP-native commerce backend for standardized checkout + order flows.
- Agent orchestration layer for H2A, A2A, A2H.
- Vyper settlement policy for enforcement credibility.
- Circle + Arc rails for practical payment operations, plus optional AIsa x402 pay-per-call authorization for metered agent enrichment.
- **KeeperHub** (ETHGlobal OpenAgents sponsor): dual execution mode — local Arc and online testnet mode via **Circle Bridge Kit** CCTP from Arc USDC (Ethereum Sepolia, Base Sepolia, Polygon Amoy, Arbitrum Sepolia, Avalanche Fuji), then KeeperHub payout on the destination chain.

Speaker note: We did not replace standards. We composed them, then layered sponsor-grade execution where it helps.

---

## Slide 4 - Product Experience

In one interface, users can:

- Trigger agent intents (`tip_dancer`, `unlock_clip`, `battle_entry`)
- Inspect live orchestration traces
- Run settlement policy checks
- View UCP discovery/conformance outputs
- Execute the top 6 use cases with selectable payment rails (`metamask`, `circle_wallet`, `x402`, `offchain_demo`)
- ENS judge card: check name ownership + registration estimate, signer Sepolia ETH, mode selection (`demo/circle_wallet/metamask`), and resolve/gating proof in one place
- ENS operator convenience: `.eth` auto-normalization, `agentId` auto-helper (`agent.<label>`), source-aware wallet balance checks, and in-flight setup timer
- ENS workshop v2 proof points: strict ENSIP-25 parameterized text-record trust (registry interop + agent id), privacy payout mode chip, and version compatibility chip
- KeeperHub operator panel: one-click `Refresh balances`, destination signer source + wallet-id hints, **POL**-accurate gas copy on Polygon Amoy, a **USDC + native** funding reminder tied to the selected network, and API hints that separate **Circle bridge signer gas** from **KeeperHub org executor gas**

Speaker note: Every action is explainable and auditable in real time.

---

## Slide 5 - Architecture

```mermaid
flowchart LR
  User[User] --> Orchestrator[OrchestratorAgent]
  Orchestrator --> Fan[FanAgent]
  Orchestrator --> Dancer[DancerAgent]
  Orchestrator --> Payments[PaymentsAgent]
  Payments --> UcpCheckout["POST /api/ucp/checkout/create"]
  Payments --> UcpOrder["GET /api/ucp/orders/:id"]
  Payments --> Settlement["VyperPolicyCheck"]
  Settlement --> Arc["ArcTestnetContract"]
  U5Payout[U5DeclareWinner] --> KeeperHub["KeeperHubExecute"]
  KeeperHub --> ArcTransfer["ArcTokenTransfer"]
  Orchestrator --> Trace[A2HTrace]
```

Speaker note: Payments agent is the constrained executor; UCP remains the contract for commerce semantics. KeeperHub is the optional reliability layer when we push the prize pool on-chain.

---

## Slide 6 - Credibility Proof

- Vyper settlement contract deployed on Arc testnet.
- Deployment tx and contract address documented.
- Runtime enforcement enabled by default in demo baseline.
- Titanoboa tests passing.

Speaker note: This is not mock-only logic. We have chain-backed evidence plus deterministic local verification.

---

## Slide 7 - Why We Win

- Strong standards alignment: UCP-centric design.
- Clear agent narrative: H2A, A2A, A2H fully demonstrated.
- Practical fallback strategy: disable enforcement switch for resilience.
- End-to-end shipped with docs, tests, and Git history.

Speaker note: We optimized for both innovation and reliability under hackathon constraints.

---

## Slide 8 - Live Demo Script (2-3 min)

1. Show `GET /api/agents/capabilities` — settlement mode + `keeperhub_execution` when configured.
2. Show `GET /api/agents/identity` (ERC-8004 style metadata).
3. Run `tip_dancer` agent session.
4. Highlight trace events and settlement proof.
5. Trigger one payment flow with MetaMask and one with AIsa x402 pilot rail (`judge_feedback_request`) to show metered external authorization.
6. In AIsa LLM panel, run `x402_probe` with `/apis/v2/perplexity/sonar` and call out that `upstream_status: 402` + `expected_payment_challenge: true` is a successful challenge-detection proof.
7. Switch to `x402_external_settle`, paste external replay headers from AIsa nanopayment client, and show deterministic replay outcome handling (`200` answer when accepted, typed `402` settlement error otherwise).
8. If `402` persists after funded-wallet replay, call out this as an upstream settlement-policy boundary and continue demo with `api_key_proxy` for answer output.
9. Show UCP checkout/order endpoints.
10. **KeeperHub:** show local vs online mode on demo transfer, then run one online execution path (Arc → Bridge Kit CCTP → target testnet → KeeperHub transfer).
11. Point at the **funding reminder** and **destination gas fund-hint** JSON (`instructions`, `keeperhub_executor_gas_hint`) so judges see the dual-wallet gas story.
12. Show signer-source clarity in action (`destination wallet` vs fallback) and wallet-id match hints on at least two target chains.
13. ENS proof step: `Check ENS name status` -> `Check wallet Sepolia ETH` (source-aware) -> `Register/Update` (writes `agent-registration[…][…]` + value) -> `Verify ENSIP-25 trust` (`registry` + `agentId` in body) -> `Resolve ENS for Vyper agent` (same `registry` + `agentId` as query params for live trust fields).
14. Run `challenge_payout` once with trust off (show blocked), then once with trust on (show allowed).
15. Point out decoded resolve payload and judge chips: intent gate, trust gate, privacy route, version compatibility.
16. Show Arc deployment proof in README.

Speaker note: Keep pace fast. Focus on trust signals, standards, and one crisp sponsor story (CCTP lands liquidity; KeeperHub executes payout; UCP decides commerce shape). For x402, emphasize that challenge handling and replay architecture are live even when upstream settlement policy blocks specific funded wallets.

---

## Slide 9 - Business / Ecosystem Potential

- Agent-native creator marketplaces
- Autonomous payment assistants
- Protocol-compliant commerce agents for wallets/exchanges
- B2B orchestration middleware for multi-agent payment ops

Speaker note: This can evolve from demo to infrastructure.

---

## Slide 10 - Ask

We are looking for:

- Ecosystem partners for ERC-8004 identity registry integration
- Wallet/channel integrations for wider H2A entry points
- Pilot creators and payment platforms for real-world validation

Speaker note: We already have the core stack. Next is distribution and integrations.

---

## Backup Slide - Technical References

- UCP endpoints in `src/server.js`
- Agent orchestration in `src/agents/orchestrator.js`
- KeeperHub client in `src/keeperhub/client.js`; online bridge in `src/settlement/cctpBridge.js`; routes `/api/keeperhub/*` (including `online-*-wallet/fund-hint`) and `execute_via_keeperhub` on declare-winner in `src/server.js`
- KeeperHub UI controls, `#keeperhub-funding-reminder`, and signer/gas hints in `public/main.js` + `public/index.html`
- ENS helpers in `src/ens/ensip25.js`, `src/ens/resolveAgentEns.js`, `src/ens/setupAgentEns.js`
- Vyper contract in `contracts/AgentSettlementPolicy.vy`
- Tests in `tests/titanoboa/test_agent_settlement_policy.py`
- Deployment helper in `scripts/deploy_vyper_policy.py`
- Marketing one-pager: `docs/lovable-landing-page.md`; Lovable rebuild spec: `docs/lovable-mega-prompt.md`
