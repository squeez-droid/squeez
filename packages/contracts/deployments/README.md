# Deployment records

Each `(chain, stage)` target uses an append-only address-book stack under
`deployments/<chain>/<stage>*.json`. The existing root `testnet*.json` files remain a compatibility alias for the
live Elysium testnet until they are moved and verified without changing their contents.

1. `<stage>.json` — initial proxy, Beacon, and implementation addresses.
2. `<network>-core-upgrade.json` — latest Registry, FeeVault, and Factory implementations.
3. `<network>-curve-upgrade.json` — latest Curve Beacon implementation.
4. `<network>-v4-stack.json` — pinned self-hosted testnet v4 contracts with receipts, gas, and source commits.
5. `<network>-graduation-infra.json` — immutable PositionManager binding and ownerless LiquidityLocker deployment.
6. `<network>-graduation.json` — latest configured graduation adapter.
7. `<network>-manifest.json` — generated audit view containing the merged address book and broadcast history.

Generate the audit manifest with `npm run deployment:manifest:testnet` or
`npm run deployment:manifest:mainnet`. The manifest records transaction hashes, contract/function identity,
addresses, sender/recipient, nonce, value, block, receipt status, gas limit, gas used, effective gas price,
transaction fee, log count, totals, source commit, and source broadcast file. It never reads or stores private keys.

Runtime services load these files through `tools/with-env.mjs`. Non-empty process environment variables may be used
as deliberate emergency overrides; copied `.env` address values have lower priority than deployment records.
