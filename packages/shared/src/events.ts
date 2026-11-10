/** On-chain events the indexer must track (see brief: "Frontend & indexer"). */
export const INDEXED_EVENTS = [
  "TokenLaunched",
  "ProtectionPolicyPinned",
  "ProtectedPurchaseRecorded",
  "CurveTrade",
  "Graduated",
  "PoolSwap",
  "CreatorFeeAccrued",
  "CreatorFeeClaimed",
  "ProtectionTaxAccrued",
  "IdentityRegistered",
  "IdentityEvidence",
  "IdentityLocked",
  "SymbolPermanentlyLocked",
  "SqueezBurned",
] as const;

export type IndexedEvent = (typeof INDEXED_EVENTS)[number];
