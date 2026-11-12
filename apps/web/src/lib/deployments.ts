"use client";

import { useQuery } from "@tanstack/react-query";
import { SQUEEZ_NETWORKS, type SqueezChain, type Stage } from "@squeez/shared";
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
  if (response.ok) return response.json() as Promise<PublicDeploymentTarget[]>;

  // Keep every independently healthy target selectable when the aggregate
  // gateway registry is temporarily unavailable.
  const targets = await Promise.all(Object.values(SQUEEZ_NETWORKS).map(async (target) => {
    const configResponse = await fetch(`${apiUrl}/v1/${target.chain}/${target.stage}/config`, { signal });
    if (!configResponse.ok) return null;
    const config = await configResponse.json() as { capability?: DeploymentCapability };
    if (config.capability !== "enabled" && config.capability !== "read-only") return null;
    return {
      chain: target.chain,
      stage: target.stage,
      chainId: target.chainId,
      capability: config.capability,
      apiBasePath: `/v1/${target.chain}/${target.stage}`,
    } satisfies PublicDeploymentTarget;
  }));
  return targets.flatMap((target) => target ? [target as PublicDeploymentTarget] : []);
}

export function useDeploymentRegistry() {
  return useQuery({
    queryKey: ["deployment-registry", apiUrl],
    queryFn: ({ signal }) => getDeploymentRegistry(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
