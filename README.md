# Krump x UCP Hack Strategy

This repository contains a hackathon-ready strategy for building a Krump Dance commerce and creator ecosystem using:

- Universal Commerce Protocol (UCP)
- Arc Testnet
- Circle Gateway Nanopayments

## Contents

- `docs/krump-ucp-usecases.md` - 10 use cases, scoring model, rankings, and top 3 MVP tracks.
- `docs/auditability-playbook.md` - Git audit workflow, AI attribution standards, and submission checklist.

## Why this structure

ETHGlobal requires visible in-event progress, transparent AI usage, and a clear demo path. These docs are designed to be committed incrementally and referenced directly in the final submission form.

## Top 3 MVP Demo (Implemented)

This repo now includes a runnable prototype for the three prioritized tracks:

- `U1` Live Battle Micro-Tipping
- `U2` Pay-Per-Move Tutorial Unlock
- `U5` Battle Entry + Instant Prize Pool Payout

### Local Run

1. Install dependencies:
   - `npm install`
2. Copy env template and fill values:
   - `cp .env.example .env`
2. Start the app:
   - `npm start`
3. Open:
   - `http://localhost:3000`

### Project Structure

- `src/server.js` - Express API implementing the three MVP tracks.
- `src/state.js` - In-memory demo state and helper utilities.
- `public/index.html` - Demo UI for all track flows.
- `public/main.js` - Client-side interactions for API calls.
- `public/styles.css` - Minimal styling for demo readability.

## Wallet Rails (New)

Each interactive flow now supports three modes:

- `MetaMask on-chain` - Sends an on-chain transaction from browser wallet and records tx hash.
- `Circle wallet` - Calls server endpoint to initiate Circle wallet transfer, then records transfer id.
- `Offchain demo only` - Keeps previous mocked behavior.

### Circle setup

Put your Circle credentials in `.env`:

- `CIRCLE_API_KEY`
- `CIRCLE_ENTITY_SECRET`
- `CIRCLE_WALLET_ID`
- `CIRCLE_TOKEN_ID` (token id for USDC on your configured chain)
- `CIRCLE_DESTINATION_ADDRESS`

If your Circle account uses a different transfer endpoint, update:

- `CIRCLE_TRANSFER_PATH`

### MetaMask setup

Set these in `.env` so the UI can switch/add chain and send tx:

- `ARC_CHAIN_ID`
- `ARC_CHAIN_NAME`
- `ARC_RPC_URL`
- `ARC_NATIVE_SYMBOL`
- `ONCHAIN_TREASURY_ADDRESS`
