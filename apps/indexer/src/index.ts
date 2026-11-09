import { ponder } from "ponder:registry";
import { creatorFee, protocolFee, token, trade } from "ponder:schema";

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

ponder.on("SqueezCurve:CurveTrade", async ({ event, context }) => {
  await context.db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: event.args.token,
    trader: event.args.trader,
    isBuy: event.args.isBuy,
    hypeAmount: event.args.hypeAmount,
    tokenAmount: event.args.tokenAmount,
    source: "curve",
    hypeRaised: event.args.hypeRaised,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  });
});

ponder.on("SqueezFeeVault:CreatorFeeAccrued", async ({ event, context }) => {
  await context.db.insert(creatorFee).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: event.args.token,
    asset: event.args.asset,
    kind: "accrued",
    amount: event.args.amount,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  });
});

ponder.on("SqueezFeeVault:CreatorFeeClaimed", async ({ event, context }) => {
  await context.db.insert(creatorFee).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: event.args.token,
    asset: event.args.asset,
    recipient: event.args.recipient,
    kind: "claimed",
    amount: event.args.amount,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  });
});

ponder.on("SqueezFeeVault:ProtocolFeeAccrued", async ({ event, context }) => {
  await context.db.insert(protocolFee).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: event.args.token,
    asset: event.args.asset,
    buybackAmount: event.args.buybackAmount,
    treasuryAmount: event.args.treasuryAmount,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  });
});

// TODO: Graduated → token.status/pool, PoolSwap → trade (source "pool"), SqueezBurned → burn
