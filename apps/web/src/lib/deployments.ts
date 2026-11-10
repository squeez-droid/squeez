"use client";

import { useQuery } from "@tanstack/react-query";
import type { SqueezChain, Stage } from "@squeez/shared";
import { apiUrl } from "./chain";

export type DeploymentCapability = "enabled" | "read-only" | "maintenance" | "coming-soon";

export interface PublicDeploymentTarget {
  chain: SqueezChain;
  stage: Stage;
  chainId: number;
  capability: DeploymentCapability;
  apiBasePath: string;
}

export async function getDeploymentRegistry(signal?: AbortSignal): Promise<PublicDeploymentTarget[]> {
  const response = await fetch(`${apiUrl}/v1/deployments`, { signal });
  if (!response.ok) throw new Error(`Deployment registry request failed (${response.status}).`);
  return response.json() as Promise<PublicDeploymentTarget[]>;
}

export function useDeploymentRegistry() {
  return useQuery({
    queryKey: ["deployment-registry", apiUrl],
    queryFn: ({ signal }) => getDeploymentRegistry(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
