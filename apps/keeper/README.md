# @squeez/keeper

Private off-chain automation service. Its production-safe default is the permissionless graduation worker:

- polls the indexed token table for `graduating` curves;
- checks `graduated()` and `graduationState()` on-chain;
- simulates and submits `graduate()` sequentially;
- retries safely on later ticks and stops acting once state `2` is observed.

Buyback/TWAP is a separate opt-in mode (`BUYBACK_KEEPER_ENABLED=true`) and remains disabled until its production route is ready.

```bash
cp .env.testnet.example .env.testnet # run at repository root
npm run dev:keeper:testnet
npm run start:keeper:mainnet
```

Required graduation settings are `KEEPER_PRIVATE_KEY`, `GRADUATION_KEEPER_ENABLED`, and
`GRADUATION_KEEPER_INTERVAL_SECONDS`. The keeper wallet needs only enough native currency for gas and has no
privileged contract role; `graduate()` is permissionless. `src/buyback.ts` remains a skeleton until the TWAP route is enabled.
