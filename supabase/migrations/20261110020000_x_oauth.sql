-- Short-lived OAuth state and privacy-preserving creator verification records.
do $$
declare
  target text;
begin
  foreach target in array array['testnet_system', 'mainnet_system', 'robinhood_testnet_system', 'robinhood_mainnet_system'] loop
    execute format($sql$
      create table if not exists %I.x_oauth_request (
        state_hash text primary key,
        code_verifier text not null,
        wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
        return_to text not null,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      )
    $sql$, target);
    execute format($sql$
      create table if not exists %I.x_creator_session (
        session_hash text primary key,
        wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
        x_user_id_hash text not null check (x_user_id_hash ~ '^0x[0-9a-f]{64}$'),
        username text not null,
        expires_at timestamptz not null,
        created_at timestamptz not null default now(),
        revoked_at timestamptz
      )
    $sql$, target);
    execute format($sql$
      create table if not exists %I.x_attestation_usage (
        id bigserial primary key,
        wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
        x_user_id_hash text not null check (x_user_id_hash ~ '^0x[0-9a-f]{64}$'),
        chain_id bigint not null,
        factory text not null check (factory ~ '^0x[0-9a-f]{40}$'),
        nonce bigint not null,
        created_at timestamptz not null default now(),
        unique (chain_id, factory, wallet, nonce)
      )
    $sql$, target);
    execute format('create index if not exists x_session_wallet_idx on %I.x_creator_session (wallet, created_at desc)', target);
    execute format('create index if not exists x_attestation_rate_idx on %I.x_attestation_usage (x_user_id_hash, created_at desc)', target);
    execute format('alter table %I.x_oauth_request enable row level security', target);
    execute format('alter table %I.x_creator_session enable row level security', target);
    execute format('alter table %I.x_attestation_usage enable row level security', target);
    execute format(
      'revoke all on %I.x_oauth_request, %I.x_creator_session, %I.x_attestation_usage from anon, authenticated',
      target, target, target
    );
    execute format('grant select, insert, update, delete on %I.x_oauth_request to service_role', target);
    execute format('grant select, insert, update on %I.x_creator_session to service_role', target);
    execute format('grant select, insert on %I.x_attestation_usage to service_role', target);
    execute format('grant usage, select on all sequences in schema %I to service_role', target);
  end loop;
end $$;
