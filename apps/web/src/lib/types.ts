import type { FeeDestination, PairCategory } from "@squeez/shared";
export type { Address, FeeDestination, PairCategory } from "@squeez/shared";

export interface QuotePair {
  symbol: string;
  name: string;
  category: PairCategory;
  source: string;
  status: "ready" | "confirm-address" | "unconfirmed";
  enabled: boolean;
  decimals: number;
  usd: number;
  color: string;
  address: string | null;
}

export interface Token {
  address: string;
  curveAddress: string;
  name: string;
  ticker: string;
  image: string | null;
  emoji: string;
  color: string;
  description: string;
  socials: { x: string | null; telegram: string | null; website: string | null };
  creator: string;
  feeRecipient: string;
  quote: string;
  creatorFeeBps: number;
  feeDestination: FeeDestination;
  launchConfigId: number;
  status: "curve" | "graduating" | "graduated";
  hypeRaised: number;
  createdAt: string;
  volume24hUsd: number;
  change24h: number;
  holdersCount: number;
  trending: number;
  priceHype?: number;
  poolAddress?: string;
  graduatedAt?: string;
  lpLocked?: { tokenAmount: number; quoteAmount: number };
  lockedSupply?: number;
}

export interface Trade {
  txHash: string;
  trader: string;
  side: "buy" | "sell";
  hypeAmount: number;
  tokenAmount: number;
  priceHype: number;
  venue: "curve" | "uniswap-v4";
  timestamp: string;
}

export interface Holder {
  address: string;
  label: string | null;
  pct: number;
  tag: "pool" | "locker" | "curve" | "creator" | null;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeHype: number;
}

export interface CreatorFeeEvent {
  type: "accrued" | "claimed";
  amountHype: number;
  source: "curve" | "hook";
  txHash: string;
  timestamp: string;
}
