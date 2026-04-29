# Krump Protocol Agents

## Tagline

The first UCP-native agent commerce app where humans and AI agents coordinate payments with live Arc testnet credibility — and optional **KeeperHub** execution for on-chain prize delivery.

## One-liner

Krump Protocol Agents turns creator economy actions (tips, tutorial unlocks, battle entry payouts) into agent-driven commerce flows using Universal Commerce Protocol (UCP), Circle rails, Vyper-backed policy enforcement, and (for [ETHGlobal OpenAgents](https://ethglobal.com/events/openagents/prizes)) optional **KeeperHub** direct execution on Arc testnet.

Top 6 MVP use cases now support live payment rail selection across MetaMask and Circle flows (with offchain demo fallback where needed), so judges can switch rails in-session without changing code.
Per-request execution mode is also available: local Arc testnet path or online mode that bridges USDC from Arc via CCTP and executes on KeeperHub-supported testnets.

## Problem

Creator payments are fragmented across wallets, apps, and trust models.  
Most demos show either chat agents or payments, but not both in a reliable, auditable flow.

## Solution

We built a full loop:

- Human to Agent (H2A): a user asks an orchestrator agent to perform a commerce intent.
- Agent to Agent (A2A): sub-agents coordinate planning and payment execution.
- Agent to Human (A2H): the app returns transparent traces and order outcomes.
- UCP stays the core contract for checkout and order semantics.

## Why this is different

- UCP-first architecture, not ad-hoc payment payloads.
- Live policy credibility: Vyper settlement contract deployed to Arc testnet.
- Production-minded fallback: one switch returns to UCP + Circle default path for demo safety.
- Built-in proof artifacts: endpoint traces, contract address, and deploy transaction.
- **Sponsor-aligned execution:** KeeperHub runs the token transfer leg when you want reliable on-chain settlement after the app has computed the winner pool — without replacing UCP checkout or Circle wallet flows.

## Core Features

### 1) Agent Orchestration (H2A / A2A / A2H)

- Intent-driven sessions: `tip_dancer`, `unlock_clip`, `battle_entry`
- Session traces with agent steps and payment context
- Identity metadata endpoint for ERC-8004 style agent identity

### 2) UCP Commerce Core

- `GET /api/ucp/discovery`
- `POST /api/ucp/checkout/create`
- `GET /api/ucp/orders/:orderId`
- `GET /api/ucp/conformance/self-test`
- Top 6 use-case payment execution paths in UI with `metamask` or `circle_wallet` options
- Per-request execution selectors (`local` vs `online`) with destination testnet options (Ethereum Sepolia, Base Sepolia, Polygon Amoy, Arbitrum Sepolia, Avalanche Fuji)

### 3) Deep Settlement Credibility

- Vyper contract: `AgentSettlementPolicy.vy`
- Arc testnet deployment proof recorded in README
- Runtime enforcement via `ENABLE_VYPER_SETTLEMENT=true`

### 4) KeeperHub execution (optional, OpenAgents)

- Organization API key (`kh_…`) — see [KeeperHub authentication](https://docs.keeperhub.com/api/authentication)
- `GET /api/keeperhub/status` and `GET /api/keeperhub/chains` for Arc discovery
- `POST /api/keeperhub/execute-transfer` for demos; U5 **declare winner** with `execute_via_keeperhub` for prize pool → winner wallet
- Documented in `README.md` and `docs/hackathon-learnings-retrospective.md`
- Live operator UX includes:
  - one-click `Refresh balances` for source Arc USDC + destination signer balances
  - explicit destination signer source mode (`destination wallet` vs `source fallback`)
  - destination signer wallet-id hints per chain
  - a clear **funding reminder**: top up on the **selected execution network** with **USDC** and that chain’s **native gas** (POL on Amoy, ETH on Sepolia networks, AVAX on Fuji, etc.)
  - gas readiness messaging that distinguishes **Circle CCTP bridge signer** balances from **KeeperHub organization executor** native requirements (API `keeperhub_executor_gas_hint` + `instructions` on destination fund-hint)

### 5) ENS Judge Identity UX (Sepolia writes, Universal Resolver reads)

- Dedicated ENS card in UI to make identity/gating visible for judges.
- One-click status checks before writing:
  - ENS name ownership + registration value estimate
  - wallet Sepolia ETH balance + shortfall cue
- Write modes for demos and live runs:
  - `demo` (no onchain write, preview payload)
  - `circle_wallet` (server signer path)
  - `metamask` (wallet interaction + proof signature before submit)
- Balance checks follow selected source wallet:
  - if source = MetaMask, check connected MetaMask wallet Sepolia ETH
  - if source = Circle wallet, check created Circle wallet Sepolia ETH
- Resolve output is plain readable values (`agentId`, `allowedIntents`, actor address), then intent-allowed verdict is shown inline.
- Operator quality-of-life:
  - ENS auto-normalization (`arun` → `arun.eth`)
  - `agentId` auto-helper (`agent.arun`)
  - submission timer with commit→register wait guidance
  - workshop lanes shown in chips: Trust (ENSIP-25-style), Privacy (payout mode), Versioning (compatibility)

## Architecture (high level)

1. User triggers intent in UI.
2. Orchestrator delegates to sub-agents.
3. Payments agent creates UCP checkout and checks order status.
4. Settlement policy evaluates risk/limits.
5. Trace + outcome returned to user.
6. For U5 on-chain payout (optional): server calls KeeperHub direct execution after pool math — commerce logic stays in-app; execution is delegated.

### 6) Multi-chain destination wallet readiness

- Destination signer wallets are provisioned for all target online chains:
  - `BASE-SEPOLIA`
  - `ETH-SEPOLIA`
  - `MATIC-AMOY`
  - `ARB-SEPOLIA`
  - `AVAX-FUJI`
- Polygon Amoy native gas labeling uses `POL` in UX hints and warnings.
- Online bridging uses **Circle Bridge Kit** (Arc App Kit) from Arc USDC; optional env tuning for Amoy RPCs and bridge speed (`POLYGON_AMOY_RPC_URL`, `POLYGON_AMOY_RPC_PUBLIC_FIRST`, `ARC_BRIDGE_TRANSFER_SPEED`, `ALLOW_LOW_DESTINATION_GAS` — see `.env.example`).

### 7) Operator-facing funding APIs

- `POST /api/keeperhub/online-source-wallet/fund-hint` — Arc USDC source for the bridge
- `POST /api/keeperhub/online-destination-gas/fund-hint` — destination signer balances, recommended native minimum, executor gas hints, and human-readable `instructions`

## Who this is for

- Creator economy platforms
- Agent-native commerce apps
- Payment orchestration products
- Protocol teams exploring trustless agent execution

## Demo flow (60 seconds)

1. Load agent capabilities and identity (note `keeperhub_execution` when `KEEPERHUB_API_KEY` is set).
2. Run `tip_dancer` session.
3. Execute one MetaMask payment and one Circle payment in top 6 flows (for example U1 + U6 or U3 + U8).
4. Show session trace with settlement proof.
5. Show UCP checkout/order responses.
6. Show Arc deployment proof and Vyper fallback toggle.
7. Optionally: KeeperHub status + funding reminder + **Refresh balances** / fund-hint output + one demo transfer or U5 payout with “Execute via KeeperHub” checked.

## Credibility Proof

- Arc contract address and tx hash in `README.md`
- Passing Titanoboa tests for settlement logic
- Live running API endpoints for capabilities, identity, settlement, and sessions

## Tech Stack

- Node.js + Express
- `@ucp-js/sdk`
- Vyper 0.4.0
- Titanoboa + pytest
- Circle developer-controlled wallets
- Arc testnet
- [KeeperHub](https://docs.keeperhub.com/api) REST (chains + direct execution) for OpenAgents sponsor story  
- `@circle-fin/bridge-kit`, `@circle-fin/app-kit`, `@circle-fin/adapter-circle-wallets` for **online** CCTP bridging from Arc

## Call to Action

Want to build agent-native commerce where trust, payments, and orchestration are composable?  
Start with Krump Protocol Agents and ship UCP-compatible agent flows today — and plug in KeeperHub when agents must **actually** land value on-chain.
