# MEGA PROMPT: Self-host KeeperHub with Arc Testnet (for another Cursor window)

Copy everything **below the horizontal rule** into a new Cursor chat in a **fresh clone** of [KeeperHub/keeperhub](https://github.com/KeeperHub/keeperhub). Goal: run KeeperHub locally, add **Arc Testnet** (`chainId` **5042002**, hex `0x4cef52`) for seeding and **direct execution** (`POST /api/execute/transfer`), then document how **Krump Protocol Agents** (this repo — Express + UCP + Circle) links via `KEEPERHUB_API_BASE` + org key `kh_…`.

---

You are working in a **new workspace** (fresh clone). Goal: run **[KeeperHub/keeperhub](https://github.com/KeeperHub/keeperhub)** locally (or in Docker per upstream), add **Arc Testnet** (`chainId` **5042002**, hex `0x4cef52`) as a **first-class chain** for RPC seeding and for **direct execution** (`POST /api/execute/transfer`), so a separate repo (**Krump Protocol Agents** — Express + UCP + Circle) can point `KEEPERHUB_API_BASE` at this instance and use a **`kh_` org API key** from it.

## Hard constraints

1. **Use upstream correctly:** clone `https://github.com/KeeperHub/keeperhub`, prefer the **`staging`** branch (matches current public `.env.example` / README on raw GitHub). Do not invent APIs; follow files in-repo.
2. **Arc is not in default seeds today:** upstream `scripts/seed/seed-chains.ts` + `lib/rpc/rpc-config.ts` list many EVM chains but **not** `5042002`. You must **add** Arc testnet end-to-end (RPC resolution + DB seed row + any slug/key the direct-execution path expects).
3. **RPC config discipline:** `CHAIN_RPC_CONFIG` (JSON) overrides RPC URLs for **known `jsonKey` entries** per comments in `seed-chains.ts` and the JSON shape documented at the top of `lib/rpc/rpc-config.ts`. Do not assume `CHAIN_RPC_CONFIG` alone creates a brand-new chain row if the seed does not define that `jsonKey`; you likely need **both** a new `jsonKey` block in seed data **and** a matching `CHAIN_CONFIG` entry for `5042002` (mirror how other chain IDs map to `jsonKey`, `envKey`, `publicDefault`).
4. **Port conflict with Krump:** Krump’s demo server often uses **3000**. Either run KeeperHub dev on **3000** and tell Krump to use `PORT=3001`, or run KeeperHub on another port if Next supports it — document the chosen mapping.
5. **Auth / API keys:** Krump expects **organization** REST keys (`kh_…`) against `KEEPERHUB_API_BASE` ending with **`/api`**. After local boot, document exactly how you create or obtain a **`kh_`** key against the local Better Auth instance (whatever upstream supports in dev).

## Arc reference values (align with Krump / Arc docs)

- **Chain ID:** `5042002` (decimal)
- **Public RPC (default):** `https://rpc.testnet.arc.network`
- **Name:** `Arc Testnet`
- **Symbol (Krump demo convention):** `USDC` (match Krump `.env` `ARC_NATIVE_SYMBOL`; adjust explorer/token metadata if upstream schema requires something else, but stay consistent with Krump’s Arc testnet story)
- **Explorer (testnet):** `https://testnet.arcscan.app` (or upstream-preferred Arc explorer URL if already standardized elsewhere)

## Implementation checklist (do in order)

1. **Clone & install**
   - `git clone https://github.com/KeeperHub/keeperhub.git && cd keeperhub`
   - `git checkout staging` (or default if README says otherwise)
   - Use **pnpm** and **Node 22** per upstream README.
   - `cp .env.example .env` and fill **minimum** vars to boot **Local Development** mode (Postgres `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` matching dev URL/port).

2. **Database**
   - Run `pnpm db:push` (or upstream’s documented migrate path).
   - Run chain seed commands as documented (`pnpm db:seed-chains` / `pnpm db:seed` — follow `package.json` scripts). Ensure Arc appears in the `chains` table after seed.

3. **Code changes for Arc (expected touch points)**
   - `lib/rpc/rpc-config.ts`: add `CHAIN_CONFIG[5042002]` with a **new stable `jsonKey`** (e.g. `arc-testnet`), `envKey` / `fallbackEnvKey` names, and `publicDefault` / optional `publicFallback` pointing at Arc public RPCs.
   - `scripts/seed/seed-chains.ts`: append a `DEFAULT_CHAINS` entry for Arc using `getChainConfigValue` / `getRpcUrlByChainId` / `getWssUrl` patterns consistent with existing chains (if WSS unknown, follow how other chains handle optional WSS).
   - Search repo for **direct execution** / **transfer** network slug resolution (e.g. execute routes, chain list API). Ensure the **`network` string** accepted by `POST /api/execute/transfer` matches what you seed (document final slug explicitly, e.g. `arc-testnet` or whatever the executor uses — **verify by reading code**, not guessing).

4. **`CHAIN_RPC_CONFIG` (optional override layer)**
   - After base Arc support works with public RPC, add a short doc block in your output showing a **valid minimal** `CHAIN_RPC_CONFIG` JSON example for your `jsonKey` that only overrides `primaryRpcUrl` / `fallbackRpcUrl` for Arc testnet (valid JSON, no trailing junk).

5. **Verify APIs Krump needs**
   - `GET {BASE}/api/chains` returns JSON including Arc `5042002`.
   - `POST {BASE}/api/execute/transfer` works against Arc with a **test recipient** and tiny amount (respect upstream wallet / Para / spending caps — if `422`, document required wallet setup from upstream docs).
   - `GET {BASE}/api/execute/{id}/status` if used.

6. **“Link to Krump” contract (documentation you must produce)**

   In **Krump Protocol Agents** (separate repo: UCP + Circle + optional KeeperHub client):

   - `KEEPERHUB_API_BASE=http://localhost:<PORT>/api` (must include `/api`)
   - `KEEPERHUB_API_KEY=kh_...` from **this** local KeeperHub
   - `KEEPERHUB_EXECUTE_NETWORK=<exact_slug_you_verified>` if Krump cannot infer slug from `/api/chains` alone

   Krump should run with `PORT` **different** from KeeperHub if both are local.

   Reference implementation in Krump: `src/keeperhub/client.js` (including **numeric `network` chain IDs** for some public testnets when `/execute/transfer` rejects string slugs), `src/settlement/cctpBridge.js` (Bridge Kit online bridge + gas hints), routes under `/api/keeperhub/*`, README KeeperHub section.

## Deliverables (what you output back to the user)

1. **Exact file diffs** or patch summary listing every file changed and why.
2. **Exact `.env` keys** required for local KeeperHub + Arc (redact secrets).
3. **Exact Krump `.env` snippet** for linking.
4. **Smoke test commands** (`curl` examples) hitting `/api/chains` and `/api/execute/transfer`.
5. **Troubleshooting table:** HTML 404 (missing `/api`), 401 (wrong key type `wfb_` vs `kh_`), 422 wallet not configured, parse errors for `CHAIN_RPC_CONFIG`.

## Success criteria

- Fresh `pnpm dev` (or chosen mode) boots.
- `/api/chains` lists **Arc Testnet** with chainId **5042002** and sensible RPC URLs.
- Direct execution transfer path recognizes Arc **network** slug and does not 400/404 for “unknown network”.
- Clear handoff for Krump: `KEEPERHUB_API_BASE`, key type, port layout, and `KEEPERHUB_EXECUTE_NETWORK` if needed.

Start by **reading** `README.md`, `.env.example`, `scripts/seed/seed-chains.ts`, and `lib/rpc/rpc-config.ts` on `staging`, then implement Arc support with the smallest correct diff.
