# @squeez/indexer

[Ponder](https://ponder.sh) indexer for Squeez. Goldsky is the alternative (Elysium infra partner); the schema here maps 1:1 to a Goldsky subgraph if we switch.

```bash
cp .env.testnet.example .env.testnet # run at repository root
npm run dev:indexer:testnet          # GraphQL at http://localhost:42069
```

Launch and metadata events are wired. Add handlers for the remaining indexed events as their contracts are completed;
the public web reads indexed rows through `apps/backend`, never through a database credential.

Storage: with `DATABASE_URL` empty Ponder uses local PGlite. In production it writes to Supabase Postgres,
into the schema named by `DATABASE_SCHEMA` (`testnet` or `mainnet`). See `supabase/README.md`.
