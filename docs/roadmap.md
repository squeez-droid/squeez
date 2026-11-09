# Squeez development roadmap

Source of truth: `docs/brief/squeez-dev-brief.md`. Re-audited against the repository on Nov 9, 2026.

The first release target is a HYPE-only testnet lifecycle:

`launch → curve buy/sell → fee accrual → graduation → v4 swap → creator claim`

USDC, Unit/Ondo assets, holder rewards, buyback-and-vest, and $SQUEEZ burn automation are expansions. They
must not delay or weaken the HYPE lifecycle.

## Status

- `[x]` implemented and verified locally
- `[~]` partial or blocked from verification
- `[ ]` not implemented
- `[!]` requires a verified external value or product decision

## Definition of done

A task is done only when its implementation, tests, event/indexer path, UI state, and operational logging are
complete. UI-only layouts and contract skeletons are partial.

## Data integrity rules

1. No generated/sample token, trade, price, candle, holder, wallet, reward, statistic, address, hash, block,
   timestamp, graduation, or transaction state may be shown.
2. Current state comes from RPC contract reads. Historical/aggregate state comes from indexed on-chain events.
3. USD values come from an approved on-chain oracle or sufficiently liquid pool with freshness checks.
4. If a source is missing, stale, or not configured, show loading, empty, stale, or unavailable—not zero unless
   the source explicitly returned zero.
5. Testnet and mainnet use separate env files, address books, indexer schemas, workers, and start blocks.
6. Protocol parameters are never maintained independently in frontend JSON.
7. User/admin transactions are real wallet transactions and are logged from request through receipt or failure.
8. The browser exposes only the public API URL and network selector. RPC/database/indexer/keeper credentials stay
   inside the Coolify backend stack.
9. Indexers use only stable `testnet`/`mainnet` schemas. Ponder exclusively owns those schemas; operational logs
   live in `testnet_system`/`mainnet_system`, and testnet contract replacements use an explicit reset plus backfill.

---

## Phase 0 — Remove simulation and establish configuration

- [x] Move the brief under `docs/brief`.
- [x] Remove the duplicate root web app, HTML preview, generated build artifacts, and mock generator.
- [x] Remove token/trade/holder/candle/reward/stat/config/wallet JSON fixtures.
- [x] Keep only static copy in `apps/web/data/content.json` and `landing.json`.
- [x] Remove the demo wallet, fake transaction hashes, timer-based confirmations, and simulated graduation.
- [x] Add one root `.env.testnet` and `.env.mainnet` source of truth, gitignored, shared by every workspace.
- [x] Remove placeholder testnet chain ID, RPC, and fake contract addresses.
- [x] Fail indexer configuration when chain/RPC/factory/start-block values are missing.
- [x] Fixture/client-boundary checks, workspace typecheck, lint, contract format/build/tests, and the testnet web
  production build pass; runtime launch remains safely unavailable while required protocol values are absent.
- [x] Strict env validation is active in web chain creation, indexer config, keeper config, and Foundry deploy
  parameters; testnet address, bytecode, ownership, wiring, and runtime configuration are verified against RPC.
- [x] Add a repository check that rejects fixture market files, demo-wallet flags, placeholder addresses, and
  simulation code.
- [x] Remove direct browser access to RPC/Supabase, add an API boundary and client-bundle leak check, and generate
  the dynamic Next.js Cloudflare Worker artifact.
- [x] Package API, Ponder indexer, and keeper as isolated services in one Coolify Compose deployment.

**Exit:** repository contains no product dummy data or executable simulation path; missing external values are
explicitly unavailable.

---

## Phase 1 — Verified network and protocol decisions

### Required external values

- [x] Elysium testnet chain ID `99801`, public RPC, explorer, faucet, and bridge discovered; RPC chain ID and
  live block height verified directly on Nov 9, 2026.
- [~] Elysium mainnet chain ID `99901` and a live public community RPC verified directly; replace the community
  RPC with Kinetiq's official public endpoint when it is published/confirmed.
- [~] A pinned self-hosted PoolManager, PositionManager, canonical Permit2, wrapped HYPE, StateView, and Quoter are
  deployed with verified bytecode and recorded blocks on testnet. Universal Router, hook behavior, and all mainnet
  deployments remain.
- [~] Supabase database and isolated network migrations are configured and testnet indexing is verified; mainnet
  schema/runtime verification and any intentionally exposed read-only API remain pending.
- [~] Testnet treasury is configured and verified on-chain; replace the deployer owner with the approved admin
  multisig before a release candidate.

### Required product decisions

- [x] Stable-address upgrade boundary approved and recorded in `docs/adr/001-contract-mutability.md`: UUPS for core
  shared contracts, BeaconProxy for curves, immutable fixed-supply tokens, multisig/timelock authority.
- [x] Network launch economics are approved in `docs/adr/002-launch-economics.md`: public testnet graduates at
  0.1 HYPE and mainnet beta at 20 HYPE, with virtual HYPE reserve fixed at 40% of threshold.
- [x] Testnet public graduation policy is configured onchain at 0.1 HYPE with a 0.001 HYPE launch fee through an
  append-only LaunchConfig; the first real closing-buy and v4 graduation transaction completed successfully.
- [~] Testnet sniper-tax/max-wallet parameters are configured; the final sniper-tax destination still requires
  approval before graduation is implemented.
- [!] Base v4 LP fee.
- [ ] Record approved decisions in `docs/adr/` and disclose admin/trust assumptions in product copy.
- [~] RPCs are validated using `eth_chainId` and live block height by `npm run check:networks`; validate every
  contract address by checking bytecode and expected
  interface before saving it.
- [~] Deployment writes a per-network address book with chain ID, deployment block, Factory, FeeVault, and
  QuoteRegistry; populate it through the first real testnet deployment and copy verified values into runtime env.

**Exit:** testnet env is complete and verified; every economic/security decision needed by the HYPE path is
approved.

---

## Phase 2 — Contract foundation

- [~] Fixed-supply Token, QuoteRegistry, Factory, and Curve state skeletons exist. Factory config validation,
  exact treasury fee forwarding, fee-recipient persistence/update authorization, and launch metadata events are
  implemented and tested.
- [x] FeeVault foundation: registered-curve authorization, per-token/per-asset accounting, native/ERC-20 deposits,
  protocol 80/20 accounting, dynamic creator-recipient claims, treasury-only withdrawals, and liability isolation.
- [~] FeeVault Hook authorization, revocation, per-asset capped buyback withdrawal, and liability-isolation tests
  are complete. The ownerless LiquidityLocker atomically pulls residual tokens plus the registered v4 position and
  exposes no withdrawal path; real PositionManager integration and the Uniswap v4 Hook remain.
- [x] Factory, FeeVault, and QuoteRegistry use UUPS proxies; Curves use BeaconProxy; fixed-supply Tokens remain
  immutable. Testnet proxy/implementation/beacon slots and ownership are verified, 39 tests cover upgrade/state
  preservation, and funded launch/buy/sell transactions were indexed through the proxy deployment.
- [x] Add strict `LaunchConfig` validation and explicit custom errors for the implemented launch path.
- [~] Core UUPS proxies use two-step ownership transfer with pending-owner acceptance and tested upgrade/config
  authorization. Testnet is still owned by the configured admin wallet; transfer to a Safe/timelock and transfer
  UpgradeableBeacon ownership before release.
- [x] Complete QuoteRegistry contract-code/decimals/route validation, active quote enumeration without duplicates,
  immutable native-HYPE rules, and route metadata events.
- [~] Deploy script atomically initializes UUPS Registry/Vault/Factory proxies and the Curve UpgradeableBeacon,
  derives reserves that sell 5/7 supply, and records proxy plus implementation addresses. The proxy testnet deployment
  at block `26619541` and the subsequent core/Curve implementation upgrades have verified bytecode, ERC-1967 slots,
  ownership, wiring, treasury, HYPE quote, and config. An overlay address book plus generated audit manifest records
  transaction hashes, receipts, blocks, gas and fees; deterministic CREATE2, funded E2E launch, and mainnet remain.
- [x] Add construction/initialization, access-control, config-boundary, and deployment-wiring tests.
- [x] Install Foundry locally and run format/build/test without network dependencies (72 test entries passing,
  including UUPS/Beacon authorization, state preservation, and three stateful solvency/conservation invariants over
  4,096 randomized protocol actions per run).

**Exit:** a fresh local deployment is reproducible, role-safe, tested, and emits an address book.

---

## Phase 3 — Real launch vertical slice

- [x] Factory enforces exact launch fee plus optional opening-buy value and forwards only the launch fee to treasury.
- [x] Factory/Curve persist creator, fee recipient, fee configuration, quote, metadata URI, token, curve, and
  config ID through state and canonical events.
- [x] Only the creator can update the fee recipient; every update emits an event.
- [x] Opening buy executes atomically in `launch()` with minimum-output protection and full rollback; only the
  creator can buy in the launch block.
- [x] IPFS metadata v1 schema, on-chain `ipfs://`/name/symbol/length validation, image/content limits, URL rules,
  immutable metadata URI, Pinata V3 pinning, and one-time wallet-signature upload authorization are implemented;
  live image and metadata CIDs were pinned and used by the verified testnet launch.
- [x] Extend launch events so the indexer can discover required fee configuration and metadata without local data.
- [x] Unit/fuzz tests cover fee bounds, inactive quotes, invalid metadata, insufficient/excess value, atomic opening
  buy/slippage, treasury failure, and malicious fee-recipient reentrancy.
- [x] Indexer schema and handlers store launch identity (`chainId`, block, log index, tx hash), fee configuration,
  and token metadata; migrations, database connection, backfill, live indexing, and API reads are verified on testnet.
- [~] Web Launch loads runtime contract/economic config, obtains opening-buy output from Factory `eth_call`, signs
  and pins metadata, submits the real payable Factory call with 1% opening-buy slippage, and waits for its receipt;
  the underlying launch/IPFS/indexing path is verified on testnet, while browser-wallet UI evidence remains.
- [~] Explore and token header query indexed launches through the backend with no fixture fallback; deployed-contract,
  database, and API runtime reads are verified, while browser UI and stale/error-state evidence remain.
- [~] Metadata authorization/upload and web transaction lifecycle share one request ID; indexed events now recover
  that request ID from the submitted transaction hash. Automated and browser-wallet E2E evidence remain.

**Exit:** one testnet transaction launches a token and it appears in Explore from the indexed event.

---

## Phase 4 — Protected bonding-curve trading and FeeVault

- [x] Specify curve equations, calibration, inverse quotes, units, and rounding in `docs/curve-math.md`.
- [x] Implement on-chain buy/sell quotes and state-changing HYPE trades with conservative rounding, deadline,
  slippage, reentrancy protection, token/HYPE settlement, monotonicity, supply-cap, and round-trip tests.
- [x] Curve calibration sells exactly 5/7 supply at the approved threshold, proven by deterministic and fuzz
  monotonicity/supply-cap tests.
- [~] Apply 1% protocol fee and creator fee through FeeVault; calculate sniper tax after base fees and isolate it
  as `sniperTaxAccrued` until its final destination is approved.
- [x] Enforce atomic creator opening-buy, creator-only launch block, and early max-wallet behavior.
- [x] FeeVault validates curve identity during Factory registration, accounts per token/asset, splits protocol fee
  80/20, follows creator-authorized recipient updates, and protects creator liabilities from treasury withdrawal.
- [x] Add owner-controlled/revocable v4 Hook authorization and buyback-operator authorization with per-asset caps,
  balance bounds, reentrancy protection, events, and creator/treasury liability-isolation tests to FeeVault.
- [x] Unit/fuzz tests cover monotonic pricing, supply caps, round trips, rounding, solvency, fees at 0/2/10%,
  authorization, caps, liability isolation, slippage, deadlines, exact-threshold/overshoot refunds, refund failure,
  and malicious recipients. Stateful invariants continuously verify Curve native liabilities, FeeVault bucket
  accounting, and token-supply conservation across randomized buy/sell/claim/withdraw sequences.
- [~] Emit/index CurveTrade and creator/protocol fee events with canonical identity, dynamically discover Factory
  curves, and expose token trades/creator fees through the API; holders and candles remain.
- [x] Web quotes through `eth_call`, submits real buy/sell transactions (including sell approval), waits for the
  receipt, and refreshes indexed trades/fees after confirmation.
- [x] UI shows fee/tax/slippage from contract reads and indexed results; authoritative settlement is never computed
  from local placeholder math, and the obsolete simulated trading components were removed.

**Exit:** two testnet wallets buy/sell and all reserves, liabilities, events, index tables, and UI values reconcile.

---

## Phase 5 — HYPE graduation and v4 trading

- [x] Cap closing buy exactly at the threshold with fee-aware monotonic search, refund overshoot, revert atomically
  when a recipient rejects the refund, and test exact threshold plus one-wei/large overshoot boundaries.
- [x] Curve enters a closed `graduating` state before token/FeeVault/refund external calls, rejects further buy/sell,
  and exposes permissionless graduation through a chain-specific adapter boundary. Execution is reentrancy-protected,
  idempotent after success, and atomically retry-safe after adapter failure or malformed settlement.
- [~] Deterministic TOKEN/HYPE and ERC-20 pair ordering plus full-precision `sqrtPriceX96` math are implemented;
  the deployed native-HYPE adapter initializes PoolManager at the final reserve ratio, while ERC-20 graduation support
  and a funded testnet lifecycle remain.
- [x] Ownerless LiquidityLocker validates curves/adapters through FeeVault and the curve factory, atomically pulls the
  PositionManager NFT plus token/native dust, prevents duplicate locks, rejects foreign NFTs, and has no withdrawal or
  admin-call path. Testnet evidence locks PositionManager NFT #2, seeds 10/49 supply, and permanently locks the expected
  4/49 residual supply.
- [x] Hook accepts only FeeVault-registered, graduated Squeez token/quote pools, rejects swaps before PoolManager
  initialization, and charges protocol/creator fees from the quote side for exact-input/output in both directions.
- [x] Test exact threshold, one wei around threshold, refund failure, repeated graduation, adapter failure recovery,
  malformed settlement, permissionless execution, token ordering, locked-asset invariants, and unauthorized pools;
  and hook fee deltas for native/ERC-20 quote-side settlement.
- [x] Index threshold/attempt/final graduation events, persist `graduating`/`graduated` plus pool address, disable curve
  trading from indexed status, and expose those states in Explore/token UI. The API exposes the active venue and the
  web automatically switches from curve reads/writes to the v4 Quoter/router after graduation.
- [x] Deploy the exact-input Squeez v4 router, emit/index `PoolSwap` with the original trader, and prove native-HYPE
  buy/sell on the graduated testnet pool with Quoter-derived slippage bounds. Both transactions increased the
  creator, treasury, and buyback FeeVault buckets; evidence is preserved in `docs/evidence/phase-5/testnet-v4-swaps.json`.
- [x] Creator Rewards loads fee-recipient tokens from the indexer, reads native-HYPE liabilities directly from
  FeeVault, submits real single/all wallet claims, and refreshes indexed claim history. The testnet claim cleared the
  liability, reconciled the recipient balance including gas, and is preserved in
  `docs/evidence/phase-5/testnet-creator-claim.json`.

**Exit:** the complete HYPE lifecycle passes on testnet and reconciles from contracts through the UI.

---

## Phase 6 — Observability and testnet release candidate

- [x] Append-only per-network system-log migration exists.
- [~] Fixed shared event taxonomy and append-only log writers are implemented in backend, indexer, and keeper;
  deployment/admin integrations and explicit Ponder reorg hooks remain.
- [~] Launch metadata, web transaction lifecycle, and indexed events correlate through one request ID without
  logging sensitive bodies; every implemented indexed event and keeper tick is logged, while reorgs,
  deployments/admin calls, graduation, and the not-yet-implemented buyback transaction lifecycle remain.
- [~] Explore and token surfaces now expose loading, empty, retry, RPC failure, missing checkpoint, and measured
  Ponder block-lag/stale states; apply the same status contract to fees, rewards, and future graduation surfaces.
- [x] Reconciliation command verifies FeeVault liabilities/buckets, native balances, curve HYPE/sniper-tax balances,
  and indexed creator fees; the post buy/sell testnet run reports zero mismatches.
- [~] Preserved evidence now covers launch, curve buy/sell, graduation, v4 buy/sell, FeeVault bucket increases, and
  creator claim. Consolidate these transactions into one repeatable release-candidate report after the web claim UI
  has browser-wallet evidence.
- [ ] Security review curve solvency, FeeVault liabilities, hook settlement, graduation, access control, and any
  upgrade path.

**Exit:** HYPE-only testnet release candidate has no fixtures, full logs, reconciliation evidence, and no open
critical/high review finding.

---

## Phase 7 — Expansion after HYPE release candidate

### Quote assets

- [ ] Enable USDC only after official address, custody, liquidity, route, oracle, decimals, and graduation test.
- [ ] Enable Unit and Ondo assets individually only after the same checks plus eligibility/transfer restrictions.
- [ ] Add HYPE→quote graduation conversion with TWAP/oracle bound, deadline, minimum output, and retry rules.

### Advanced creator fees

- [!] Approve buyback-and-vest protocol cut and holder time-weighting/anti-gaming formula.
- [ ] Implement five-year vesting and holder accumulator with conservation invariants.

### $SQUEEZ buyback

- [!] Approve $SQUEEZ supply/distribution/pool and keeper interval/chunk policy.
- [ ] Implement capped FeeVault withdrawal, protected swap, verifiable burn, monitoring, retries, and indexing.

---

## Phase 8 — Mainnet

- [ ] Audit and freeze a source commit.
- [ ] Deploy and verify contracts; publish addresses, parameters, admin powers, and timelock delays.
- [ ] Start mainnet indexer from verified deployment blocks and reconcile it before exposing the UI.
- [ ] Deploy a separately configured mainnet web worker.
- [ ] Run a capped canary lifecycle before broader promotion.

## Out of scope

Governance, $SQUEEZ staking, and automatic HyperCore spot listing.
