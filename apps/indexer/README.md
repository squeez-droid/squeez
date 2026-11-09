# @squeez/indexer

[Ponder](https://ponder.sh) indexer for Squeez. Goldsky is the alternative (Elysium infra partner); the schema here maps 1:1 to a Goldsky subgraph if we switch.

```bash
cp .env.testnet.example .env.testnet
npm run dev -w @squeez/indexer   # testnet, GraphQL at http://localhost:42069
```

Status: skeleton. Only `TokenLaunched` is wired. Replace `abis/` with the ABIs from `packages/contracts/out` after `forge build`, then add handlers for the rest of `INDEXED_EVENTS`. When it is live, swap the functions in `apps/web/src/lib/data.ts` for GraphQL queries.

Storage: with `DATABASE_URL` empty Ponder uses local PGlite. In production it writes to Supabase Postgres,
into the schema named by `DATABASE_SCHEMA` (`testnet` or `mainnet`). See `supabase/README.md`.
