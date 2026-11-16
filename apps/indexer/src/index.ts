import { ponder } from "ponder:registry";
import { eq } from "ponder";
import {
  creatorFee,
  holderBalance,
  identity as identityTable,
  protectedPurchase,
  protectionTax,
  protocolFee,
  token,
  trade,
} from "ponder:schema";
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

ponder.on("SqueezLaunchFactory:ProtectionPolicyPinned", async ({ event, context }) => {
  await context.db.update(token, { address: event.args.token }).set({
    protectionPolicyId: event.args.policyId,
    protectionPolicyHash: event.args.policyHash,
  });
  await logIndexed("ProtectionPolicyPinned", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezCurve:ProtectedPurchaseRecorded", async ({ event, context }) => {
  await context.db.insert(protectedPurchase).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: event.args.token,
    buyer: event.args.buyer,
    tokenAmount: event.args.tokenAmount,
    cumulativeAmount: event.args.cumulativeAmount,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  });
  await logIndexed("ProtectedPurchaseRecorded", event.transaction.hash, event.block.number, event.log.logIndex);
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

ponder.on("SqueezToken:Transfer", async ({ event, context }) => {
  const zero = "0x0000000000000000000000000000000000000000";
  const tokenAddress = event.log.address;
  if (event.args.from.toLowerCase() !== zero) {
    await context.db.insert(holderBalance).values({
      id: `${tokenAddress}-${event.args.from}`.toLowerCase(), token: tokenAddress,
      account: event.args.from, balance: 0n - event.args.value,
      updatedAt: event.block.timestamp, blockNumber: event.block.number,
    }).onConflictDoUpdate((row) => ({
      balance: row.balance - event.args.value,
      updatedAt: event.block.timestamp,
      blockNumber: event.block.number,
    }));
  }
  if (event.args.to.toLowerCase() !== zero) {
    await context.db.insert(holderBalance).values({
      id: `${tokenAddress}-${event.args.to}`.toLowerCase(), token: tokenAddress,
      account: event.args.to, balance: event.args.value,
      updatedAt: event.block.timestamp, blockNumber: event.block.number,
    }).onConflictDoUpdate((row) => ({
      balance: row.balance + event.args.value,
      updatedAt: event.block.timestamp,
      blockNumber: event.block.number,
    }));
  }
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

ponder.on("SqueezFeeVault:ProtectionTaxAccrued", async ({ event, context }) => {
  await context.db.insert(protectionTax).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: event.args.token,
    asset: event.args.asset,
    amount: event.args.amount,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  });
  await logIndexed("ProtectionTaxAccrued", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezIdentityRegistry:IdentityRegistered", async ({ event, context }) => {
  await context.db.insert(identityTable).values({
    token: event.args.token,
    creator: event.args.creator,
    curve: event.args.curve,
    canonicalHash: event.args.canonicalHash,
    nameCommitment: event.args.nameCommitment,
    symbolCommitment: event.args.symbolCommitment,
    duplicateName: event.args.duplicateName,
    duplicateSymbol: event.args.duplicateSymbol,
    originalNameToken: event.args.duplicateName ? null : event.args.token,
    originalSymbolToken: event.args.duplicateSymbol ? null : event.args.token,
    permanentlyLocked: false,
    registeredAt: event.block.timestamp,
  });
  await logIndexed("IdentityRegistered", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezIdentityRegistry:IdentityEvidence", async ({ event, context }) => {
  await context.db.update(identityTable, { token: event.args.token }).set({
    metadataHash: event.args.metadataHash,
    imageHash: event.args.imageHash,
    socialHash: event.args.socialHash,
    tokenCodeHash: event.args.tokenCodeHash,
    templateVersion: event.args.templateVersion,
  });
  await logIndexed("IdentityEvidence", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezIdentityRegistry:IdentityLocked", async ({ event, context }) => {
  await context.db.update(identityTable, { token: event.args.token }).set({ lockedUntil: event.args.expiresAt });
  await logIndexed("IdentityLocked", event.transaction.hash, event.block.number, event.log.logIndex);
});

ponder.on("SqueezIdentityRegistry:SymbolPermanentlyLocked", async ({ event, context }) => {
  await context.db.update(identityTable, { token: event.args.token }).set({
    permanentlyLocked: true,
    lockedUntil: null,
  });
  await logIndexed("SymbolPermanentlyLocked", event.transaction.hash, event.block.number, event.log.logIndex);
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

ponder.on("UniswapV4PoolManager:Swap", async ({ event, context }) => {
  // The custom router emits a richer PoolSwap event that is indexed above. Skipping it here
  // prevents duplicate rows while still capturing Universal Router and third-party trades.
  const squeezRouter = process.env.SWAP_ROUTER_ADDRESS?.toLowerCase();
  if (squeezRouter && event.args.sender.toLowerCase() === squeezRouter) return;

  // Graduation stores the lower 160 bits of the v4 pool id as the pool address.
  const pool = `0x${event.args.id.slice(-40)}` as `0x${string}`;
  const [launchedToken] = await context.db.sql
    .select({ address: token.address })
    .from(token)
    .where(eq(token.pool, pool))
    .limit(1);
  if (!launchedToken) return;

  // Native quote pools are ordered as currency0=native, currency1=token. PoolManager's
  // BalanceDelta is negative for input and positive for output from the caller perspective.
  const amount0 = event.args.amount0;
  const amount1 = event.args.amount1;
  const absolute = (value: bigint) => value < 0n ? -value : value;
  await context.db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: launchedToken.address,
    trader: event.transaction.from,
    isBuy: amount0 < 0n,
    hypeAmount: absolute(amount0),
    tokenAmount: absolute(amount1),
    source: "pool",
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
    blockNumber: event.block.number,
    logIndex: event.log.logIndex,
  }).onConflictDoNothing();
  await logIndexed("PoolManagerSwap", event.transaction.hash, event.block.number, event.log.logIndex);
});

// TODO: SqueezBurned → burn
