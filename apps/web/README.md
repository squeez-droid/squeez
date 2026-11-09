# @squeez/web

Next.js frontend for Squeez on Elysium, packaged for Cloudflare Workers through OpenNext.

## Data policy

- `data/content.json` and `data/landing.json` contain static UI copy only.
- Network, contract, token, balance, trade, holder, reward, price, and protocol statistics must come from
  deployed contracts, RPC calls, indexed events, or an approved on-chain oracle/pool.
- Missing configuration or unavailable data is rendered as an empty/unavailable state. It is never replaced
  with generated fixtures, sample wallets, placeholder addresses, fake transaction hashes, or simulated state.

## Environment

The browser bundle only receives the network selector and public Squeez API URL. RPC providers, database access,
indexer configuration, keeper keys, and backend contract env stay in Coolify.

Required web variables:

- `NEXT_PUBLIC_SQUEEZ_NETWORK`
- `NEXT_PUBLIC_API_URL`

## Run

```bash
npm install
npm run dev
```

`tools/with-env.mjs` loads the root `.env.testnet` for the default development command. The app intentionally fails
configuration validation when required chain values are missing.

## Checks

```bash
npm run typecheck
npm run lint
npm run build:testnet -w @squeez/web
npm run build:worker:testnet -w @squeez/web
```
