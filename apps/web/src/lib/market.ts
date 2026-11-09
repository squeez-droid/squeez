import { config, getQuote } from "./data";
import { SUPPLY, THRESHOLD, priceAt, progressPct } from "./curve";
import type { Token } from "./types";

export const HYPE_USD = config.hypeUsd;

export function tokenMarket(t: Token) {
  const quote = getQuote(t.quote);
  const priceHype = t.status === "graduated" ? t.priceHype ?? priceAt(THRESHOLD) : priceAt(t.hypeRaised);
  const priceUsd = priceHype * HYPE_USD;
  const priceQuote = priceUsd / quote.usd;
  const mcapUsd = priceUsd * SUPPLY;
  const progress = t.status === "graduated" ? 100 : progressPct(t.hypeRaised);
  return { quote, priceHype, priceUsd, priceQuote, mcapUsd, progress, remainingHype: Math.max(0, THRESHOLD - t.hypeRaised) };
}
