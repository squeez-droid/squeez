-- Robinhood Chain is isolated from Elysium at both the Ponder and operational-log layers.
-- Ponder exclusively owns robinhood_testnet / robinhood_mainnet. Never place application tables there.

create schema if not exists robinhood_testnet;
create schema if not exists robinhood_mainnet;

comment on schema robinhood_testnet is 'Squeez indexed data for Robinhood Chain testnet (46630)';
comment on schema robinhood_mainnet is 'Squeez indexed data for Robinhood Chain mainnet (4663)';

grant usage on schema robinhood_testnet, robinhood_mainnet to anon, authenticated, service_role;

alter default privileges for role postgres in schema robinhood_testnet
  grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema robinhood_mainnet
  grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema robinhood_testnet
  grant all on tables to service_role;
alter default privileges for role postgres in schema robinhood_mainnet
  grant all on tables to service_role;

do $$
declare
  target text;
begin
  foreach target in array array['robinhood_testnet_system', 'robinhood_mainnet_system'] loop
    execute format('create schema if not exists %I', target);
    execute format('comment on schema %I is %L', target, 'Squeez append-only activity log for ' || target);
    execute format($table$
      create table if not exists %I.system_log (
        id           bigint generated always as identity primary key,
        created_at   timestamptz not null default now(),
        source       text not null check (source in ('web', 'indexer', 'keeper', 'contracts', 'admin')),
        level        text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
        event        text not null,
        message      text,
        wallet       text check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
        token        text check (token ~ '^0x[0-9a-fA-F]{40}$'),
        tx_hash      text check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
        chain_id     bigint not null,
        block_number bigint,
        request_id   uuid,
        context      jsonb not null default '{}'::jsonb
      )
    $table$, target);

    execute format('create index if not exists system_log_created_at_idx on %I.system_log (created_at desc)', target);
    execute format('create index if not exists system_log_tx_hash_idx on %I.system_log (tx_hash) where tx_hash is not null', target);
    execute format('create index if not exists system_log_wallet_idx on %I.system_log (wallet, created_at desc) where wallet is not null', target);
    execute format('create index if not exists system_log_token_idx on %I.system_log (token, created_at desc) where token is not null', target);
    execute format('create index if not exists system_log_request_idx on %I.system_log (request_id) where request_id is not null', target);
    execute format('create index if not exists system_log_chain_idx on %I.system_log (chain_id, created_at desc)', target);

    execute format('drop trigger if exists system_log_append_only on %I.system_log', target);
    execute format(
      'create trigger system_log_append_only before update or delete on %I.system_log
         for each row execute function public.reject_system_log_change()', target);

    execute format('alter table %I.system_log enable row level security', target);
    execute format('grant usage on schema %I to anon, authenticated, service_role', target);
    execute format('revoke all on %I.system_log from anon, authenticated', target);
    execute format('grant select, insert on %I.system_log to service_role', target);
    execute format('grant insert on %I.system_log to anon, authenticated', target);
    execute format('drop policy if exists web_insert_only on %I.system_log', target);
    execute format($policy$
      create policy web_insert_only on %I.system_log
        for insert to anon, authenticated
        with check (source = 'web' and level <> 'debug' and chain_id in (4663, 46630)
          and pg_column_size(context) < 8192)
    $policy$, target);
  end loop;
end;
$$;
