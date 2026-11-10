-- Minimal public image evidence used for bounded near-duplicate checks while an on-chain identity lock is active.
do $$
declare
  target text;
begin
  foreach target in array array['testnet_system', 'mainnet_system', 'robinhood_testnet_system', 'robinhood_mainnet_system'] loop
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
