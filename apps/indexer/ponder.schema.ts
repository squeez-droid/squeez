import { onchainTable } from "ponder";

export const token = onchainTable("token", (t) => ({
  address: t.hex().primaryKey(),
  curve: t.hex().notNull(),
  creator: t.hex().notNull(),
  quote: t.hex().notNull(),
  creatorFeeBps: t.integer().notNull(),
  feeRecipient: t.hex().notNull(),
  feeDestinationKind: t.integer().notNull(),
  buybackBps: t.integer().notNull(),
  launchConfigId: t.bigint().notNull(),
  protectionPolicyId: t.bigint(),
  protectionPolicyHash: t.hex(),
  name: t.text(),
  symbol: t.text(),
  metadataUri: t.text(),
  status: t.text().notNull(), // "curve" | "graduating" | "graduated"
  pool: t.hex(),
  createdAt: t.bigint().notNull(),
  launchTxHash: t.hex().notNull(),
  launchBlockNumber: t.bigint().notNull(),
  launchLogIndex: t.integer().notNull(),
}));

export const trade = onchainTable("trade", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  token: t.hex().notNull(),
  trader: t.hex().notNull(),
  isBuy: t.boolean().notNull(),
  hypeAmount: t.bigint().notNull(),
  tokenAmount: t.bigint().notNull(),
  source: t.text().notNull(), // "curve" | "pool"
  hypeRaised: t.bigint(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
}));

export const holderBalance = onchainTable("holder_balance", (t) => ({
  id: t.text().primaryKey(), // token-account
  token: t.hex().notNull(),
  account: t.hex().notNull(),
  balance: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

export const creatorFee = onchainTable("creator_fee", (t) => ({
  id: t.text().primaryKey(),
  token: t.hex().notNull(),
  kind: t.text().notNull(), // "accrued" | "claimed"
  asset: t.hex().notNull(),
  recipient: t.hex(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
}));

export const protocolFee = onchainTable("protocol_fee", (t) => ({
  id: t.text().primaryKey(),
  token: t.hex().notNull(),
  asset: t.hex().notNull(),
  buybackAmount: t.bigint().notNull(),
  treasuryAmount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
}));

export const protectedPurchase = onchainTable("protected_purchase", (t) => ({
  id: t.text().primaryKey(),
  token: t.hex().notNull(),
  buyer: t.hex().notNull(),
  tokenAmount: t.bigint().notNull(),
  cumulativeAmount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
}));

export const protectionTax = onchainTable("protection_tax", (t) => ({
  id: t.text().primaryKey(),
  token: t.hex().notNull(),
  asset: t.hex().notNull(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.integer().notNull(),
}));

export const identity = onchainTable("identity", (t) => ({
  token: t.hex().primaryKey(),
  creator: t.hex().notNull(),
  curve: t.hex().notNull(),
  canonicalHash: t.hex().notNull(),
  nameCommitment: t.hex().notNull(),
  symbolCommitment: t.hex().notNull(),
  metadataHash: t.hex(),
  imageHash: t.hex(),
  socialHash: t.hex(),
  tokenCodeHash: t.hex(),
  templateVersion: t.integer(),
  duplicateName: t.boolean().notNull(),
  duplicateSymbol: t.boolean().notNull(),
  originalNameToken: t.hex(),
  originalSymbolToken: t.hex(),
  lockedUntil: t.bigint(),
  permanentlyLocked: t.boolean().notNull(),
  registeredAt: t.bigint().notNull(),
}));

export const burn = onchainTable("burn", (t) => ({
  id: t.text().primaryKey(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));
