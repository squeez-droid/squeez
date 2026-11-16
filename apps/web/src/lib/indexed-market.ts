import { TOTAL_SUPPLY } from "@squeez/shared";
import { formatEther } from "viem";
import type { IndexedToken } from "./indexer";

/**
 * Fully diluted market cap in the network's native asset, derived from the
 * latest indexed on-chain trade. Returns null until the first trade exists.
 */
export function indexedMarketCapNative(token: Pick<IndexedToken, "lastHypeAmount" | "lastTokenAmount">): number | null {
  const nativeAmount = BigInt(token.lastHypeAmount || "0");
  const tokenAmount = BigInt(token.lastTokenAmount || "0");
  if (nativeAmount <= 0n || tokenAmount <= 0n) return null;

  const priceNative = Number(formatEther(nativeAmount)) / Number(formatEther(tokenAmount));
  const marketCap = priceNative * TOTAL_SUPPLY;
  return Number.isFinite(marketCap) && marketCap >= 0 ? marketCap : null;
}
