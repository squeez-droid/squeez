-- One Supabase project, one Postgres schema per network: `testnet` and `mainnet`.
--
-- The indexer (Ponder) owns the tables inside each schema. It creates and migrates them on start,
-- using DATABASE_SCHEMA from apps/indexer/.env.<network>. This migration only creates the schemas
-- and the read-only access the web app needs through the Supabase Data API.

create schema if not exists testnet;
create schema if not exists mainnet;

comment on schema testnet is 'Squeez indexed data for Elysium testnet (written by apps/indexer)';
comment on schema mainnet is 'Squeez indexed data for Elysium mainnet (written by apps/indexer)';

grant usage on schema testnet, mainnet to anon, authenticated, service_role;

-- Ponder creates its tables later as the `postgres` role, so the grants go on future tables.
-- Indexed data is public on-chain data: clients may read it, only the indexer may write it.
alter default privileges for role postgres in schema testnet
  grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema mainnet
  grant select on tables to anon, authenticated;

alter default privileges for role postgres in schema testnet
  grant all on tables to service_role;
alter default privileges for role postgres in schema mainnet
  grant all on tables to service_role;
