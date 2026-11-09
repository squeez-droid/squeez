/** On-chain events the indexer must track (see brief: "Frontend & indexer"). */
export const INDEXED_EVENTS = [
  "TokenLaunched",
  "CurveTrade",
  "Graduated",
  "PoolSwap",
  "CreatorFeeAccrued",
  "CreatorFeeClaimed",
  "SqueezBurned",
] as const;

export type IndexedEvent = (typeof INDEXED_EVENTS)[number];
