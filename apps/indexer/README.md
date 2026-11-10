# @squeez/indexer

[Ponder](https://ponder.sh) indexer for Squeez. Goldsky is the alternative (Elysium infra partner); the schema here maps 1:1 to a Goldsky subgraph if we switch.

```bash
cp .env.testnet.example .env.testnet # run at repository root
npm run dev:indexer:testnet          # GraphQL at http://localhost:42069
```

Launch and metadata events are wired. Add handlers for the remaining indexed events as their contracts are completed;
the public web reads indexed rows through `apps/backend`, never through a database credential.

Storage: with `DATABASE_URL` empty Ponder uses local PGlite. In production it writes to Supabase Postgres,
into the target-qualified schema named by `DATABASE_SCHEMA` (`testnet`, `robinhood_testnet`, or
`robinhood_mainnet` for currently enabled targets). See `supabase/README.md`.

Before starting the Robinhood mainnet indexer, run `npm run preflight:indexer:robinhood:mainnet`. The preflight
verifies the selected chain, stable schema, factory bytecode, deployment-derived start block, and RPC head. Ponder
then backfills automatically from that start block. Optional post-graduation contracts are indexed only after both
their address and deployment block exist in the address book; a core-only deployment does not receive dummy values.
`INDEXER_MAX_REQUESTS_PER_SECOND` defaults to `2` and `INDEXER_LOG_BLOCK_RANGE` to `10` so an initial backfill does
not overwhelm a low-throughput RPC plan. Raise them only after confirming the provider's sustained allowance.

Ponder exclusively owns the network schema. After a testnet contract/config replacement, reset and backfill
the stable `testnet` schema with `npm run db:reset-indexer:testnet`; never create versioned schemas such as
`testnet_v2`. The command is deliberately testnet-only and preserves `testnet_system` and every mainnet schema.
