# @squeez/contracts

Foundry project for the Squeez protocol on Elysium.

| Contract | Role |
| --- | --- |
| `SqueezLaunchFactory` | Deploys token + curve, takes launch fee, stores the active `LaunchConfig` |
| `SqueezToken` | Plain ERC-20, 1B supply minted to the curve |
| `SqueezCurve` | HYPE bonding curve, fees, sniper tax, max wallet, graduation |
| `SqueezHook` | Uniswap v4 hook taking protocol + creator fee after graduation |
| `SqueezLiquidityLocker` | Holds LP + locked supply forever (no withdraw) |
| `SqueezFeeVault` | Fee accrual, creator claims, holder distribution, buyback/treasury shares |
| `SqueezQuoteRegistry` | Admin allowlist of quote assets + HYPE→quote routes |

```bash
npm install                      # from the repo root (installs OpenZeppelin)
npm run setup -w @squeez/contracts   # forge-std into lib/
npm run build -w @squeez/contracts
npm run test  -w @squeez/contracts

cp .env.testnet.example .env.testnet                                   # fill it in
npm run deploy:testnet -w @squeez/contracts
npm run deploy:mainnet -w @squeez/contracts -- --account squeez-deployer   # keystore, no raw key
```

Status: skeleton. Types, events, constants, the registry and the sniper-tax decay are in place; trading, graduation, the hook and the vault revert with `NotImplemented()`.
