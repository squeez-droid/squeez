-- Append-only activity log, one per network: testnet_system.system_log and mainnet_system.system_log.
--
-- Every app writes here: the indexer (each event handled), the keeper (each tick, tx sent, failure),
-- deploy/admin scripts (each on-chain admin action) and the web app (wallet + transaction lifecycle,
-- client errors). It lives outside the Ponder-owned `testnet` / `mainnet` schemas on purpose.
--
-- Rows can never be updated or deleted through the API: the log is evidence when something goes wrong.

create or replace function public.reject_system_log_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'system_log is append-only';
end;
$$;

do $$
declare
  network text;
  target text;
begin
  foreach network in array array['testnet', 'mainnet'] loop
    target := network || '_system';

    execute format('create schema if not exists %I', target);
    execute format('comment on schema %I is %L', target, 'Squeez activity log for Elysium ' || network);

    execute format($table$
      create table if not exists %I.system_log (
        id           bigint generated always as identity primary key,
        created_at   timestamptz not null default now(),
        source       text not null check (source in ('web', 'indexer', 'keeper', 'contracts', 'admin')),
        level        text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
        event        text not null,               -- e.g. 'tx.submitted', 'curve.trade.indexed', 'keeper.tick.failed'
        message      text,
        wallet       text check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
        token        text check (token ~ '^0x[0-9a-fA-F]{40}$'),
        tx_hash      text check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
        chain_id     bigint,
        block_number bigint,
        request_id   uuid,                         -- groups the rows of one user action or keeper tick
        context      jsonb not null default '{}'::jsonb
      )
    $table$, target);

    execute format('create index if not exists system_log_created_at_idx on %I.system_log (created_at desc)', target);
    execute format('create index if not exists system_log_tx_hash_idx on %I.system_log (tx_hash) where tx_hash is not null', target);
    execute format('create index if not exists system_log_wallet_idx on %I.system_log (wallet, created_at desc) where wallet is not null', target);
    execute format('create index if not exists system_log_token_idx on %I.system_log (token, created_at desc) where token is not null', target);
    execute format('create index if not exists system_log_problems_idx on %I.system_log (created_at desc) where level in (''warn'', ''error'')', target);
    execute format('create index if not exists system_log_request_idx on %I.system_log (request_id) where request_id is not null', target);

    execute format('drop trigger if exists system_log_append_only on %I.system_log', target);
    execute format(
      'create trigger system_log_append_only before update or delete on %I.system_log
         for each row execute function public.reject_system_log_change()', target);

    -- Access: backend services (service_role) read and insert; the browser may only insert its own rows.
    execute format('alter table %I.system_log enable row level security', target);
    execute format('grant usage on schema %I to anon, authenticated, service_role', target);
    execute format('revoke all on %I.system_log from anon, authenticated', target);
    execute format('grant select, insert on %I.system_log to service_role', target);
    execute format('grant insert on %I.system_log to anon, authenticated', target);

    execute format('drop policy if exists web_insert_only on %I.system_log', target);
    execute format($policy$
      create policy web_insert_only on %I.system_log
        for insert to anon, authenticated
        with check (source = 'web' and level <> 'debug' and pg_column_size(context) < 8192)
    $policy$, target);
  end loop;
end;
$$;
