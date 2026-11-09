# @squeez/keeper

Off-chain buyback keeper. Every `TWAP_INTERVAL_SECONDS` it buys `$SQUEEZ` with a small chunk of the protocol's buyback share (0.80% of volume) and burns it.

```bash
cp .env.testnet.example .env.testnet
npm run dev -w @squeez/keeper              # testnet
npm run start:mainnet -w @squeez/keeper    # needs .env.mainnet
```

Status: skeleton. `src/buyback.ts` describes the tick; wire it to the `SqueezFeeVault` ABI after the contracts are deployed.
