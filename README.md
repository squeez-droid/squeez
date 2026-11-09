# Squeez

Fixed-supply token launchpad on **Elysium** (Hyperliquid L2 by Kinetiq). Tokens launch on a HYPE bonding curve, graduate to a locked Uniswap v4 pool, and pay a fixed 1% protocol fee plus a 0–10% creator fee.

## Repo layout

```
apps/
  web/          Next.js 14 frontend (App Router, wagmi/viem, Tailwind)
  indexer/      Ponder indexer for protocol events
  keeper/       TWAP buyback & burn bot
packages/
  contracts/    Solidity contracts (Foundry)
  shared/       Shared TypeScript: constants, chain config, types, event names
supabase/       Migrations: one Postgres schema per network (testnet, mainnet)
tools/          Repo scripts (with-env.mjs loads .env.<network>)
docs/           Architecture notes, roadmap, and internal brief (gitignored, local only)
```

## Getting started

Requirements: Node 20+ (`nvm use`), npm 10+, and [Foundry](https://book.getfoundry.sh) for the contracts.

```bash
npm install                                                   # installs every workspace
cp .env.testnet.example .env.testnet                          # one env for every testnet service
npm run dev                                                   # web on testnet, http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev:web:testnet` | Run the testnet web app |
| `npm run dev:api:testnet` | Run the testnet API |
| `npm run dev:indexer:testnet` | Run the testnet Ponder indexer |
| `npm run dev:keeper:testnet` | Run the testnet keeper |
| `npm run build` | Production build of the web app |
| `npm run typecheck` | Typecheck shared, web and keeper |
| `npm run contracts:setup` | Install forge-std into `packages/contracts/lib` |
| `npm run contracts:build` / `contracts:test` | Build / test contracts |

## Networks and env files

Every service reads the same root `.env.testnet` or `.env.mainnet`. Only the root example templates are committed;
the real files are gitignored. Commands select the service and network, so values are never duplicated.

| Workspace | Testnet | Mainnet |
| --- | --- | --- |
| `apps/web` | `npm run dev:web:testnet` | `npm run dev:web:mainnet` |
| `apps/backend` | `npm run dev:api:testnet` | `npm run dev:api:mainnet` |
| `apps/indexer` | `npm run dev:indexer:testnet` | `npm run dev:indexer:mainnet` |
| `apps/keeper` | `npm run dev:keeper:testnet` | `npm run start:keeper:mainnet` |
| `packages/contracts` | `npm run deploy:contracts:testnet` | `npm run deploy:contracts:mainnet -- --account <keystore>` |

`tools/with-env.mjs` always loads the selected root file; values set by Coolify, Cloudflare, CI, or another secret
manager override local file values.

Data lives in Supabase with a separate schema per network. See [supabase/README.md](supabase/README.md).

## Status

- `apps/web`: UI shell with static copy only; live values remain empty until contracts and the indexer are configured.
- `packages/contracts`, `apps/indexer`, `apps/keeper`: base structure with types, events and TODOs from the dev brief.
