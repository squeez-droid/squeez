# Coolify backend services

For near-zero-downtime updates, create three **Dockerfile Applications** from the same repository and
`Dockerfile.backend`. Do not deploy the public API as a Docker Compose application: Coolify application-level
rolling updates are not supported for Compose resources.

| Application | `SQUEEZ_SERVICE` | Domain | Port |
| --- | --- | --- | --- |
| API | `api` | `api.squeez.tech` | `3000` |
| Indexer | `indexer` | none | none |
| Keeper | `keeper` | none | none |

The API is the only public application. Enable its `/ready` check and rolling updates. A replacement API must
become healthy before Coolify removes the previous container. Do not configure a host port, fixed/custom container
name, or custom IP because those settings force stop-then-start deployment.

Indexer and keeper have independent restart/deployment lifecycles. A worker crash must never stop or mark the API
unhealthy. Avoid overlapping keeper instances because two signers could submit the same job; configure that private
application for stop-then-start until database-backed leader locking is implemented.

`compose.yaml` remains available for local/staging operation and contains the same three isolated processes, but a
Compose deployment does not provide Coolify's application-level rolling replacement.

Copy every backend key from the root `.env.testnet.example` or `.env.mainnet.example` into Coolify's environment
editor. Do not upload an env file containing secrets. Set `NEXT_PUBLIC_API_URL` to the public API domain and add the web domain to
`ALLOWED_ORIGINS`.

The RPC upstream, database URL, keeper key, and internal schema are never returned by the API. Contract
addresses, chain ID, and explorer are intentionally public protocol data returned by `/v1/config`.

Pinata credentials belong only to the `api` service. Set `PINATA_JWT`; keep `PINATA_API_URL` at
`https://api.pinata.cloud` and set `PINATA_GATEWAY_URL` to your dedicated Pinata gateway when available.
Never prefix these variables with `NEXT_PUBLIC_`.

Recommended API settings in Coolify:

- Ports Exposes: `3000`
- Healthcheck: image-provided `/ready` check (or HTTP `GET /ready` on port `3000`)
- Stop Grace Period: `30` seconds
- Container name: generated/default, not consistent or custom
- Host port mapping: none

## Robinhood mainnet temporary read-only mode

Until the archive-RPC backfill and release gate are complete, deploy `api-robinhood-mainnet` with
`SQUEEZ_API_CAPABILITY=read-only` and expose it through the gateway with
`ROBINHOOD_MAINNET_CAPABILITY=read-only`. Read endpoints and the allowlisted read-only RPC proxy remain available;
metadata upload, OAuth issuance, attestations, operational-log writes, and every other mutating HTTP request return
`403`. Readiness requires database, isolated schema, correct-chain RPC, and factory bytecode. A missing/stale indexer
is reported as `degraded` but does not kill the read-only API or the already healthy testnet services.

Run the mainnet indexer as its own private application/resource with schema `robinhood_mainnet`, initial defaults
`INDEXER_MAX_REQUESTS_PER_SECOND=2` and `INDEXER_LOG_BLOCK_RANGE=10`. Its failure or restart must not participate in
the API container lifecycle. Do not deploy a mainnet keeper and do not change either capability to `enabled` until
historical backfill, reconciliation, and the release gate pass.
