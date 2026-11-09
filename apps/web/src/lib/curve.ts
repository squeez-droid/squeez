// Constant-product bonding curve math with virtual reserves (pump.fun / Pons style).
// Calibration: virtual token = 1B, virtual HYPE = 0.4 × threshold.
// So the curve sells exactly 5/7 of supply when HYPE raised = threshold, and the
// final curve price = initial v4 pool price (quote / 10/49 supply).
import { config } from "./data";

const lc = config.launchConfig;
export const THRESHOLD = lc.graduationThresholdHype;
export const X0 = THRESHOLD * lc.virtualHypeReserveRatio;
export const Y0 = lc.virtualTokenReserve;
export const K = X0 * Y0;
export const SUPPLY = lc.totalSupply;
export const CURVE_SUPPLY = SUPPLY * lc.curveSupplyFraction;

export const PROTOCOL_FEE_BPS = config.protocol.PROTOCOL_FEE_BPS;
export const BURN_BPS = config.protocol.BURN_BPS_OF_PROTOCOL;

/** marginal price (HYPE per token) at HYPE raised `raised` */
export const priceAt = (raised: number) => (X0 + raised) ** 2 / K;
export const tokensSoldAt = (raised: number) => Y0 - K / (X0 + raised);
export const progressPct = (raised: number) => Math.min(100, (raised / THRESHOLD) * 100);

export interface Quote {
  inAmount: number;
  outAmount: number;
  protocolFee: number;
  creatorFee: number;
  sniperTax: number;
  totalFee: number;
  priceImpactPct: number;
  refundHype: number;
  graduates: boolean;
  effectiveHypeIn: number;
}

/** Curve buy: HYPE input (gross), fees taken from input. */
export function quoteBuy(raised: number, hypeIn: number, creatorFeeBps: number, sniperTaxBps = 0): Quote {
  const feeBps = PROTOCOL_FEE_BPS + creatorFeeBps;
  const remaining = Math.max(0, THRESHOLD - raised);
  // max net HYPE the curve still accepts
  let gross = hypeIn;
  let net = gross * (1 - feeBps / 10000);
  let refund = 0;
  let graduates = false;
  if (net >= remaining && remaining > 0) {
    graduates = true;
    net = remaining;
    const needGross = remaining / (1 - feeBps / 10000);
    refund = gross - needGross;
    gross = needGross;
  }
  const protocolFee = (gross * PROTOCOL_FEE_BPS) / 10000;
  const creatorFee = (gross * creatorFeeBps) / 10000;
  const sniperTax = (net * sniperTaxBps) / 10000;
  const netAfterTax = net - sniperTax;
  const out = tokensSoldAt(raised + netAfterTax) - tokensSoldAt(raised);
  const spot = priceAt(raised);
  const avg = out > 0 ? netAfterTax / out : spot;
  return {
    inAmount: hypeIn,
    outAmount: Math.max(0, out),
    protocolFee,
    creatorFee,
    sniperTax,
    totalFee: protocolFee + creatorFee + sniperTax,
    priceImpactPct: spot > 0 ? ((avg - spot) / spot) * 100 : 0,
    refundHype: refund,
    graduates,
    effectiveHypeIn: gross,
  };
}

/** Curve sell: token input, HYPE output minus fees. */
export function quoteSell(raised: number, tokensIn: number, creatorFeeBps: number): Quote {
  const sold = tokensSoldAt(raised);
  const t = Math.min(tokensIn, sold);
  const newRaised = K / (Y0 - (sold - t)) - X0;
  const grossOut = Math.max(0, raised - newRaised);
  const protocolFee = (grossOut * PROTOCOL_FEE_BPS) / 10000;
  const creatorFee = (grossOut * creatorFeeBps) / 10000;
  const spot = priceAt(raised);
  const avg = t > 0 ? grossOut / t : spot;
  return {
    inAmount: tokensIn,
    outAmount: grossOut - protocolFee - creatorFee,
    protocolFee,
    creatorFee,
    sniperTax: 0,
    totalFee: protocolFee + creatorFee,
    priceImpactPct: spot > 0 ? ((spot - avg) / spot) * 100 : 0,
    refundHype: 0,
    graduates: false,
    effectiveHypeIn: 0,
  };
}

/** v4 pool swap after graduation (approx. full-range constant product). Prices in HYPE-equivalent. */
export function quotePool(priceHype: number, lpTokens: number, amountIn: number, side: "buy" | "sell", creatorFeeBps: number): Quote {
  const feeBps = PROTOCOL_FEE_BPS + creatorFeeBps;
  const x = lpTokens * priceHype; // quote reserve (HYPE equiv)
  const y = lpTokens;
  const k = x * y;
  if (side === "buy") {
    const fee = (amountIn * feeBps) / 10000;
    const net = amountIn - fee;
    const out = y - k / (x + net);
    const avg = net / out;
    return { inAmount: amountIn, outAmount: out, protocolFee: (amountIn * PROTOCOL_FEE_BPS) / 10000, creatorFee: (amountIn * creatorFeeBps) / 10000, sniperTax: 0, totalFee: fee, priceImpactPct: ((avg - priceHype) / priceHype) * 100, refundHype: 0, graduates: false, effectiveHypeIn: amountIn };
  }
  const gross = x - k / (y + amountIn);
  const fee = (gross * feeBps) / 10000;
  const avg = gross / amountIn;
  return { inAmount: amountIn, outAmount: gross - fee, protocolFee: (gross * PROTOCOL_FEE_BPS) / 10000, creatorFee: (gross * creatorFeeBps) / 10000, sniperTax: 0, totalFee: fee, priceImpactPct: ((priceHype - avg) / priceHype) * 100, refundHype: 0, graduates: false, effectiveHypeIn: 0 };
}

/** Sniper tax (bps) based on seconds since launch, not block count. */
export function sniperTaxBps(secondsSinceLaunch: number) {
  const s = config.launchConfig.sniperTax;
  if (secondsSinceLaunch >= s.decaySeconds) return 0;
  return Math.round(s.startBps * (1 - Math.max(0, secondsSinceLaunch) / s.decaySeconds));
}
