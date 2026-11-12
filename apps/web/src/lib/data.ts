import {
  BURN_BPS_OF_PROTOCOL,
  CREATOR_FEE_STEP_BPS,
  MAX_CREATOR_FEE_BPS,
  PROTOCOL_FEE_BPS,
  TOTAL_SUPPLY,
} from "@squeez/shared";
import contentJson from "@data/content.json";
import landingJson from "@data/landing.json";
import type { Candle, CreatorFeeEvent, Holder, QuotePair, Token, Trade } from "./types";

const fallbackChain = process.env.NEXT_PUBLIC_SQUEEZ_CHAIN === "robinhood" ? "Robinhood Chain" : "Elysium";
const fallbackStage = process.env.NEXT_PUBLIC_SQUEEZ_NETWORK === "mainnet" ? "" : " Testnet";

/** Static copy only. Market, wallet, protocol-state, and token data must never be added here. */
export const content = contentJson;
export const landing = landingJson;

/** Compatibility shape while UI components are migrated to contract reads. */
export const config = {
  configured: false,
  hypeUsd: 0,
  protocol: {
    PROTOCOL_FEE_BPS,
    MAX_CREATOR_FEE_BPS,
    BURN_BPS_OF_PROTOCOL,
    creatorFeeStepBps: CREATOR_FEE_STEP_BPS,
    launchFeeHype: 0,
    launchFeeTbd: true,
  },
  launchConfig: {
    id: 0,
    totalSupply: TOTAL_SUPPLY,
    graduationThresholdHype: 0,
    graduationThresholdTbd: true,
    virtualHypeReserveRatio: 0,
    virtualTokenReserve: 0,
    curveSupplyFraction: 5 / 7,
    lpSupplyFraction: 10 / 49,
    lockedSupplyFraction: 4 / 49,
    sniperTax: { startBps: 0, decaySeconds: 0, destination: "unconfigured" },
    maxWallet: { bps: 0, windowSeconds: 0, windowTbd: true },
    buybackVest: { vestYears: 5, protocolCutBps: 0, protocolCutTbd: true },
  },
  chain: {
    name: `${fallbackChain}${fallbackStage}`,
    explorer: "",
    faucet: "",
    bridge: "",
    blockTimeMs: 0,
  },
  contracts: {
    SqueezLaunchFactory: "",
    SqueezFeeVault: "",
    SqueezLiquidityLocker: "",
    SqueezQuoteRegistry: "",
    SqueezHook: "",
    SQUEEZ: "",
  },
  slippageOptionsBps: [50, 100, 300, 500],
  defaultSlippageBps: 100,
} as const;

// These collections stay empty until populated by the on-chain/indexer data layer.
export const tokens: Token[] = [];
export const quotePairs: QuotePair[] = [];
export const stats = {
  available: false,
  creatorFees24hUsd: 0,
  volume24hUsd: 0,
  squeezBurned: 0,
  squeezBurnedUsd: 0,
  tokensLaunched: 0,
  tokensGraduated: 0,
  protocolFees24hUsd: 0,
  buyback24hUsd: 0,
  treasury24hUsd: 0,
  burnHistory: [] as { date: string; squeez: number; usd: number }[],
};

export const getToken = (addressOrTicker: string): Token | undefined => { void addressOrTicker; return undefined; };
export const getQuote = (symbol: string): QuotePair => ({
  symbol,
  name: symbol,
  category: "crypto",
  source: "SqueezQuoteRegistry",
  status: "unconfirmed",
  enabled: false,
  decimals: 18,
  usd: 0,
  color: "#949E9C",
  address: null,
});
export const getTrades = (address: string): Trade[] => { void address; return []; };
export const getHolders = (address: string): Holder[] => { void address; return []; };
export const getCandles = (address: string): Candle[] => { void address; return []; };
export const getCreatorFees = (address: string): CreatorFeeEvent[] => { void address; return []; };
export const NOW = Date.now();
