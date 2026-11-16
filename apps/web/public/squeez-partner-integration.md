# Squeez partner integration

Squeez is a multichain EVM token launchpad. A token trades on its Squeez bonding curve before graduation and moves
to a Uniswap v4 pool after graduation. Token identity is always `(chainId, tokenAddress)`, never the ticker alone.

## Production discovery

No API key is required. All discovery, metadata, logo, route, and pool endpoints support public CORS.

```text
GET https://api.squeez.tech/v1/{chain}/{network}/integrations/launchpad.json
GET https://api.squeez.tech/v1/{chain}/{network}/integrations/tokens.json
GET https://api.squeez.tech/v1/{chain}/{network}/token-list.json
GET https://api.squeez.tech/v1/{chain}/{network}/tokens/{token}/route
GET https://api.squeez.tech/v1/{chain}/{network}/tokens/{token}/metadata
GET https://api.squeez.tech/v1/{chain}/{network}/tokens/{token}/logo
```

Supported target identifiers are `robinhood/mainnet`, `elysium/mainnet`, `hyperevm/mainnet`, and
`robinhood/testnet`. Read chain IDs, explorer URLs, live contract addresses, router addresses, and venue capabilities
from `integrations/launchpad.json`; do not hard-code copied addresses.

The event and execution ABI is published at:

```text
https://squeez.tech/squeez-integration-abi.json
```

## Lifecycle routing

Read `lifecycle.status` and `execution` from the enriched token feed, or request the token's `/route` endpoint.

### Before graduation: `status = curve`

- `execution.requiresLaunchpadAdapter` is `true`.
- Standard DEX routers cannot trade the token because there is no pool yet.
- Request a quote and unsigned transaction from:

```text
GET /tokens/{token}/quote?side=buy|sell&amountWei={integer}&recipient={wallet}
```

For buys, submit the returned `transaction` only when `willRevert` is `false`. For sells, confirm the returned
`approval` first and then submit `transaction`. Always simulate the final transaction again immediately before the
user signs it.

Direct contract integrations may call the Curve's router-safe entrypoints:

```solidity
function buyTo(address recipient, uint256 minTokensOut, uint256 deadline)
  external payable returns (uint256 tokensOut);

function sellTo(uint256 tokenAmount, uint256 minNativeOut, uint256 deadline, address recipient)
  external returns (uint256 nativeOut);
```

### After graduation: `status = graduated`

- `execution.requiresLaunchpadAdapter` is `false`.
- Request `/tokens/{token}/pool` for the canonical Uniswap v4 `PoolKey`, `poolId`, Quoter, router, and Permit2.
- On targets where `execution.externallyRoutable` is `true`, execute standard exact-input v4 swaps through the
  advertised Universal Router.
- Otherwise use the advertised Squeez swap router until standard-router compatibility for that target is published.

Robinhood mainnet Universal Router buy and sell compatibility has been proven on a mainnet fork, including fee-hook
accounting in the Squeez FeeVault.

## Metadata

Every enriched token entry includes:

- token name, symbol, address, decimals, creator, and quote asset;
- IPFS metadata URI and image URI;
- stable HTTPS logo and metadata URLs;
- description, website, X, and Telegram when supplied by the creator;
- launch transaction, curve address, graduation status, and pool address;
- identity/copy status and creator fee;
- active route, quote URL, and PoolKey URL.

Logo and social ingestion is controlled by the consuming platform. Squeez publishes and preserves the data, but a
third-party UI must read the partner feed or map the token metadata itself.

## Production verification

The Squeez repository includes a read-only verifier used as a release gate:

```bash
npm run check:external-integration
```

It validates the manifest, feed, token list, metadata, logo bytes, public CORS, route consistency, and curve/pool
lifecycle behavior across all active targets. It never sends a transaction.

## Integration support

Send the failing chain ID, token address, endpoint, request parameters (without credentials), response status, and
request ID to the Squeez team. Never send private keys, wallet seed phrases, RPC credentials, or API secrets.
