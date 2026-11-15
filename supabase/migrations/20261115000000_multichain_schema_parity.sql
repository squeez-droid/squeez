-- Ensure every supported chain/stage has the same operational schema surface.
-- This migration is idempotent so it can bootstrap a replacement Supabase project safely.

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
  target text;
begin
  foreach target in array array[
    'testnet_system',
    'mainnet_system',
    'robinhood_testnet_system',
    'robinhood_mainnet_system',
    'hyperevm_testnet_system',
    'hyperevm_mainnet_system'
  ] loop
    execute format('create schema if not exists %I', target);
    execute format('grant usage on schema %I to anon, authenticated, service_role', target);

    execute format($sql$
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
        chain_id     bigint,
        block_number bigint,
        request_id   uuid,
        context      jsonb not null default '{}'::jsonb
      )
    $sql$, target);
    execute format('create index if not exists system_log_created_at_idx on %I.system_log (created_at desc)', target);
    execute format('create index if not exists system_log_tx_hash_idx on %I.system_log (tx_hash) where tx_hash is not null', target);
    execute format('create index if not exists system_log_wallet_idx on %I.system_log (wallet, created_at desc) where wallet is not null', target);
    execute format('create index if not exists system_log_token_idx on %I.system_log (token, created_at desc) where token is not null', target);
    execute format('create index if not exists system_log_request_idx on %I.system_log (request_id) where request_id is not null', target);
    execute format('drop trigger if exists system_log_append_only on %I.system_log', target);
    execute format(
      'create trigger system_log_append_only before update or delete on %I.system_log for each row execute function public.reject_system_log_change()',
      target
    );
    execute format('alter table %I.system_log enable row level security', target);
    execute format('revoke all on %I.system_log from anon, authenticated', target);
    execute format('grant select, insert on %I.system_log to service_role', target);
    execute format('grant insert on %I.system_log to anon, authenticated', target);
    execute format('drop policy if exists web_insert_only on %I.system_log', target);
    execute format($policy$
      create policy web_insert_only on %I.system_log
        for insert to anon, authenticated
        with check (source = 'web' and level <> 'debug' and pg_column_size(context) < 8192)
    $policy$, target);

    execute format($sql$
      create table if not exists %I.identity_image_evidence (
        metadata_uri_hash text primary key check (metadata_uri_hash ~ '^0x[0-9a-f]{64}$'),
        image_hash text not null check (image_hash ~ '^0x[0-9a-f]{64}$'),
        perceptual_hash text not null check (perceptual_hash ~ '^0x[0-9a-f]{16}$'),
        name_commitment text not null check (name_commitment ~ '^0x[0-9a-f]{64}$'),
        symbol_commitment text not null check (symbol_commitment ~ '^0x[0-9a-f]{64}$'),
        wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
        created_at timestamptz not null default now()
      )
    $sql$, target);
    execute format('create index if not exists identity_image_hash_idx on %I.identity_image_evidence (image_hash)', target);
    execute format('create index if not exists identity_perceptual_hash_idx on %I.identity_image_evidence (perceptual_hash)', target);
    execute format('alter table %I.identity_image_evidence enable row level security', target);
    execute format('revoke all on %I.identity_image_evidence from anon, authenticated', target);
    execute format('grant select, insert on %I.identity_image_evidence to service_role', target);
  end loop;
end $$;

create schema if not exists hyperevm_testnet;
create schema if not exists hyperevm_mainnet;
grant usage on schema hyperevm_testnet, hyperevm_mainnet to anon, authenticated, service_role;
alter default privileges for role postgres in schema hyperevm_testnet grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema hyperevm_mainnet grant select on tables to anon, authenticated;
alter default privileges for role postgres in schema hyperevm_testnet grant all on tables to service_role;
alter default privileges for role postgres in schema hyperevm_mainnet grant all on tables to service_role;
