# Squeez API

Public boundary for the Cloudflare-hosted web. The browser is configured only with this service's URL.

- `GET /health`
- `GET /v1/config` returns public network and deployed-contract metadata.
- `GET /v1/tokens` and `GET /v1/tokens/:address` read indexed on-chain events.
- `GET /v1/tokens/:address/trades` returns the latest indexed curve/pool trades.
- `GET /v1/tokens/:address/fees` returns indexed creator-fee accruals and claims.
- `POST /rpc` proxies an allowlist of read-only JSON-RPC methods.

`ELYSIUM_RPC`, `DATABASE_URL`, and service credentials are backend-only. Transactions are signed by the user's
injected wallet; the backend never receives a user private key.
