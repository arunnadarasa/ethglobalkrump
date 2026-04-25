# Krump Protocol Agents

## Tagline

The first UCP-native agent commerce app where humans and AI agents coordinate payments with live Arc testnet credibility.

## One-liner

Krump Protocol Agents turns creator economy actions (tips, tutorial unlocks, battle entry payouts) into agent-driven commerce flows using Universal Commerce Protocol (UCP), Circle rails, and Vyper-backed policy enforcement.

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

### 3) Deep Settlement Credibility

- Vyper contract: `AgentSettlementPolicy.vy`
- Arc testnet deployment proof recorded in README
- Runtime enforcement via `ENABLE_VYPER_SETTLEMENT=true`

## Architecture (high level)

1. User triggers intent in UI.
2. Orchestrator delegates to sub-agents.
3. Payments agent creates UCP checkout and checks order status.
4. Settlement policy evaluates risk/limits.
5. Trace + outcome returned to user.

## Who this is for

- Creator economy platforms
- Agent-native commerce apps
- Payment orchestration products
- Protocol teams exploring trustless agent execution

## Demo flow (60 seconds)

1. Load agent capabilities and identity.
2. Run `tip_dancer` session.
3. Show session trace with settlement proof.
4. Show UCP checkout/order responses.
5. Show Arc deployment proof and fallback toggle.

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

## Call to Action

Want to build agent-native commerce where trust, payments, and orchestration are composable?  
Start with Krump Protocol Agents and ship UCP-compatible agent flows today.
