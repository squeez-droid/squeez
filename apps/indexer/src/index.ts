import { ponder } from "ponder:registry";
import { creatorFee, protocolFee, token, trade } from "ponder:schema";
import { logIndexed } from "./system-log";

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
  await logIndexed("TokenLaunched", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezLaunchFactory:TokenMetadata", async ({ event, context }) => {
  await context.db
    .update(token, { address: event.args.token })
    .set({
      name: event.args.name,
      symbol: event.args.symbol,
      metadataUri: event.args.metadataURI,
    });
  await logIndexed("TokenMetadata", event.transaction.hash, event.block.number, event.log.logIndex);
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
  await logIndexed("CurveTrade", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezCurve:GraduationThresholdReached", async ({ event, context }) => {
  await context.db.update(token, { address: event.args.token }).set({ status: "graduating" });
  await logIndexed("GraduationThresholdReached", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezCurve:GraduationAttempted", async ({ event }) => {
  await logIndexed("GraduationAttempted", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezCurve:Graduated", async ({ event, context }) => {
  await context.db.update(token, { address: event.args.token }).set({
    status: "graduated",
    pool: event.args.pool,
  });
  await logIndexed("Graduated", event.transaction.hash, event.block.number, event.log.logIndex);
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
  await logIndexed("CreatorFeeAccrued", event.transaction.hash, event.block.number, event.log.logIndex);
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
  await logIndexed("CreatorFeeClaimed", event.transaction.hash, event.block.number, event.log.logIndex);
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
  await logIndexed("ProtocolFeeAccrued", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezSwapRouter:PoolSwap", async ({ event, context }) => {
  await context.db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: event.args.token,
    trader: event.args.trader,
    isBuy: event.args.isBuy,
    hypeAmount: event.args.quoteAmount,
    tokenAmount: event.args.tokenAmount,
    source: "pool",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  });
  await logIndexed("PoolSwap", event.transaction.hash, event.block.number, event.log.logIndex);
});

// TODO: SqueezBurned → burn
