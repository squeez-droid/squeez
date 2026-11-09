# Coolify backend stack

Deploy `compose.yaml` as one Docker Compose resource. It contains three isolated processes:

- `api`: the only public service; expose port 8080 through a Coolify domain.
- `indexer`: private Ponder worker writing indexed on-chain events to PostgreSQL.
- `keeper`: private signer process. Its private key exists only in Coolify secrets.

Copy every backend key from the root `.env.testnet.example` or `.env.mainnet.example` into Coolify's environment
editor. Do not upload an env file containing secrets. Set `NEXT_PUBLIC_API_URL` to the public API domain and add the web domain to
`ALLOWED_ORIGINS`.

The RPC upstream, database URL, keeper key, and internal schema are never returned by the API. Contract
addresses, chain ID, and explorer are intentionally public protocol data returned by `/v1/config`.

Pinata credentials belong only to the `api` service. Set `PINATA_JWT`; keep `PINATA_API_URL` at
`https://api.pinata.cloud` and set `PINATA_GATEWAY_URL` to your dedicated Pinata gateway when available.
Never prefix these variables with `NEXT_PUBLIC_`.
