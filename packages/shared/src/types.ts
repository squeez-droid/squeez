export type Address = `0x${string}`;

export type PairCategory = "crypto" | "stable" | "stock";

/** Where a token's creator fee goes. Fixed at launch (only the recipient wallet can change). */
export type FeeDestination =
  | { type: "wallet" }
  | { type: "buyback-split"; buybackBps: number }
  | { type: "holders" };

export type TokenStatus = "curve" | "graduated";
