"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "@squeez/shared";
import { apiUrl } from "./chain";

export interface RuntimeProtocolConfig {
  configured: boolean;
  network: "testnet" | "mainnet";
  chain: { id: number; name: string; explorer: string };
  contracts: { factory: Address | null; quoteRegistry: Address | null; feeVault: Address | null };
  launchConfig: {
    graduationThresholdHype: string | null;
    virtualHypeReserve: string | null;
    virtualTokenReserve: string | null;
    sniperTaxStartBps: string | null;
    sniperTaxDecaySeconds: string | null;
    maxWalletBps: string | null;
    maxWalletWindowSeconds: string | null;
    launchFeeHype: string | null;
  };
}

async function fetchProtocolConfig(): Promise<RuntimeProtocolConfig> {
  const response = await fetch(`${apiUrl}/v1/config`);
  if (!response.ok) throw new Error(`Protocol config request failed (${response.status}).`);
  return response.json() as Promise<RuntimeProtocolConfig>;
}

export function useProtocolConfig() {
  return useQuery({ queryKey: ["protocol-config"], queryFn: fetchProtocolConfig, staleTime: 30_000 });
}
