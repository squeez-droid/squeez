"use client";

import { useQuery } from "@tanstack/react-query";

type NativeUsdPrices = { ETH: number | null; HYPE: number | null; updatedAt: string | null };

export function useNativeUsdPrices() {
  return useQuery<NativeUsdPrices>({
    queryKey: ["native-usd-prices"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/native-prices", { signal });
      if (!response.ok) throw new Error(`USD price request failed (${response.status})`);
      return response.json() as Promise<NativeUsdPrices>;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 2,
  });
}

export function nativeUsd(prices: NativeUsdPrices | undefined, symbol: string): number | null {
  const value = symbol === "ETH" ? prices?.ETH : symbol === "HYPE" ? prices?.HYPE : null;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
