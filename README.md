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
cp apps/web/.env.testnet.example apps/web/.env.testnet        # then fill it in
npm run dev                                                   # web on testnet, http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the web app |
| `npm run build` | Production build of the web app |
| `npm run typecheck` | Typecheck shared, web and keeper |
| `npm run dev:indexer` | Run the Ponder indexer |
| `npm run dev:keeper` | Run the buyback keeper |
| `npm run contracts:setup` | Install forge-std into `packages/contracts/lib` |
| `npm run contracts:build` / `contracts:test` | Build / test contracts |

## Networks and env files

Every app runs against one network at a time and reads its settings from `.env.testnet` or `.env.mainnet`
in its own folder. Only the `.env.<network>.example` templates are committed; the real files are gitignored.

| Workspace | Testnet | Mainnet |
| --- | --- | --- |
| `apps/web` | `npm run dev`, `deploy:testnet` | `dev:mainnet`, `deploy:mainnet` |
| `apps/indexer` | `npm run dev`, `start:testnet` | `dev:mainnet`, `start:mainnet` |
| `apps/keeper` | `npm run dev`, `start:testnet` | `start:mainnet` |
| `packages/contracts` | `deploy:testnet` | `deploy:mainnet -- --account <keystore>` |

Run them with `-w <package>` from the root, for example `npm run deploy:testnet -w @squeez/web`.
`tools/with-env.mjs` loads the file; values already set in the shell (CI, secret managers) win.

Data lives in Supabase with a separate schema per network. See [supabase/README.md](supabase/README.md).

## Status

- `apps/web`: UI shell with static copy only; live values remain empty until contracts and the indexer are configured.
- `packages/contracts`, `apps/indexer`, `apps/keeper`: base structure with types, events and TODOs from the dev brief.
