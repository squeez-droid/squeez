# @squeez/web

Next.js frontend for Squeez on Elysium.

## Data policy

- `data/content.json` and `data/landing.json` contain static UI copy only.
- Network, contract, token, balance, trade, holder, reward, price, and protocol statistics must come from
  deployed contracts, RPC calls, indexed events, or an approved on-chain oracle/pool.
- Missing configuration or unavailable data is rendered as an empty/unavailable state. It is never replaced
  with generated fixtures, sample wallets, placeholder addresses, fake transaction hashes, or simulated state.

## Environment

The repository contains `.env.testnet` and `.env.mainnet` files, both gitignored. Fill their values from
verified Elysium documentation and deployed Squeez address books. Never copy values between networks.

Required web variables:

- `NEXT_PUBLIC_SQUEEZ_NETWORK`
- `NEXT_PUBLIC_ELYSIUM_CHAIN_ID`
- `NEXT_PUBLIC_ELYSIUM_RPC`
- `NEXT_PUBLIC_ELYSIUM_EXPLORER`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_SCHEMA`
- `NEXT_PUBLIC_FACTORY_ADDRESS`
- `NEXT_PUBLIC_QUOTE_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_FEE_VAULT_ADDRESS`

## Run

```bash
npm install
npm run dev
```

`tools/with-env.mjs` loads `.env.testnet` for the default development command. The app intentionally fails
configuration validation when required chain values are missing.

## Checks

```bash
npm run typecheck
npm run lint
npm run build:testnet -w @squeez/web
```
