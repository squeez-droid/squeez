import { ponder } from "ponder:registry";
import { token } from "ponder:schema";

// Events to index (see @squeez/shared INDEXED_EVENTS):
// TokenLaunched, CurveTrade, Graduated, PoolSwap, CreatorFeeAccrued, CreatorFeeClaimed, SqueezBurned

ponder.on("SqueezLaunchFactory:TokenLaunched", async ({ event, context }) => {
  await context.db.insert(token).values({
    address: event.args.token,
    curve: event.args.curve,
    creator: event.args.creator,
    quote: event.args.quote,
    creatorFeeBps: event.args.creatorFeeBps,
    feeRecipient: event.args.feeRecipient,
    feeDestinationKind: event.args.feeDestinationKind,
    buybackBps: event.args.buybackBps,
    launchConfigId: event.args.launchConfigId,
    status: "curve",
    createdAt: event.block.timestamp,
    launchTxHash: event.transaction.hash,
    launchBlockNumber: event.block.number,
    launchLogIndex: event.log.logIndex,
  });
});

ponder.on("SqueezLaunchFactory:TokenMetadata", async ({ event, context }) => {
  await context.db
    .update(token, { address: event.args.token })
    .set({
      name: event.args.name,
      symbol: event.args.symbol,
      metadataUri: event.args.metadataURI,
    });
});

// TODO: CurveTrade → trade, Graduated → token.status/pool, PoolSwap → trade (source "pool"),
// CreatorFeeAccrued/Claimed → creatorFee, SqueezBurned → burn
