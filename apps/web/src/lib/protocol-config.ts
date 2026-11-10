"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "@squeez/shared";
import { targetApiUrl } from "./chain";
import { useSelectedTarget } from "./use-selected-target";

export interface RuntimeProtocolConfig {
  configured: boolean;
  capability: "enabled" | "read-only";
  network: "testnet" | "mainnet";
  creatorAttestation: {
    enabled: boolean;
    configured: boolean;
    optional: true;
    maxLaunchesPer24h: number;
  };
  chain: { id: number; name: string; explorer: string };
  contracts: {
    factory: Address | null;
    quoteRegistry: Address | null;
    feeVault: Address | null;
    swapRouter: Address | null;
    v4Quoter: Address | null;
    squeezHook: Address | null;
  };
  v4Pool: { lpFeeBps: string | null; tickSpacing: string | null };
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

export async function getProtocolConfig(signal?: AbortSignal, baseUrl = targetApiUrl): Promise<RuntimeProtocolConfig> {
  const response = await fetch(`${baseUrl}/config`, { signal });
  if (!response.ok) throw new Error(`Protocol config request failed (${response.status}).`);
  return response.json() as Promise<RuntimeProtocolConfig>;
}

export function useProtocolConfig() {
  const selected = useSelectedTarget();
  return useQuery({ queryKey: ["protocol-config", selected.targetApiUrl],
    queryFn: ({ signal }) => getProtocolConfig(signal, selected.targetApiUrl), staleTime: 30_000 });
}
