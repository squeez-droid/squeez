# Supabase

Squeez uses one Supabase project with **separate Postgres schemas per network**:

| Schema | Contents | Written by | Read by |
| --- | --- | --- | --- |
| `testnet` / `mainnet` | Indexed on-chain data (tokens, trades, fees, burns) | `apps/indexer` (Ponder) | `apps/web` (anon, read-only) |
| `testnet_system` / `mainnet_system` | `system_log`: append-only activity log | indexer, keeper, scripts (service role); web (insert only) | team, via service role / dashboard |

Testnet and mainnet data never share a table, so a testnet reindex can never touch mainnet data.

There is no mock data: every number the app shows comes from the chain, either read directly
through RPC or from tables the indexer built from on-chain events.

## System log

`<network>_system.system_log` records every activity so a problem can be traced end to end:

| Source | What it logs |
| --- | --- |
| `web` | wallet connect / disconnect / wrong network, tx requested, submitted (hash), confirmed, reverted, rejected, client errors |
| `indexer` | each event handled (`TokenLaunched`, `CurveTrade`, `Graduated`, ...), reorgs, handler errors |
| `keeper` | each TWAP tick: balance read, swap tx, burn tx, slippage guard hit, failures |
| `contracts` / `admin` | deployments, `setLaunchConfig`, `setQuote`, treasury withdrawals |

Columns: `created_at`, `source`, `level`, `event`, `message`, `wallet`, `token`, `tx_hash`, `chain_id`,
`block_number`, `request_id` (groups one user action or keeper tick), `context` (jsonb).
Trace a problem by `tx_hash`, `wallet`, `token` or `request_id`. Rows cannot be updated or deleted.

## Setup

1. Create a Supabase project.
2. Link it and apply the migrations:

   ```bash
   npx supabase init        # once, creates supabase/config.toml next to migrations/
   npx supabase link --project-ref <project-ref>
   npx supabase db push     # creates the network schemas, grants and system_log tables
   ```

3. Expose both schemas to the Data API: Dashboard > Project settings > API > Exposed schemas,
   add `testnet`, `mainnet`, `testnet_system` and `mainnet_system` (or add them to `[api].schemas` in `config.toml`).
4. Fill the env files:
   - `apps/indexer/.env.<network>`: `DATABASE_URL` (direct connection or session pooler, port 5432)
     and `DATABASE_SCHEMA=<network>`.
   - `apps/web/.env.<network>`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `NEXT_PUBLIC_SUPABASE_SCHEMA=<network>`.

## Rules

- Ponder owns the tables inside `testnet` / `mainnet` and expects every table there to be its own.
  Do not add hand-written tables to these schemas.
- Anything that is not indexed chain data (like the system log) goes in the `<network>_system` schemas.
- The anon key is public and only has `select`. The `service_role` key and the database password are
  secrets: they live in gitignored env files or the deploy platform, never in the repo.
