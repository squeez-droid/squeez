"use client";

import { SQUEEZ_NETWORKS, deploymentTargetId, parseDeploymentTarget } from "@squeez/shared";
import { useSyncExternalStore } from "react";
import { apiUrl, deploymentTarget, supportedChains } from "./chain";

export function useSelectedTarget() {
  const query = useSyncExternalStore(
    (notify) => { window.addEventListener("popstate", notify); return () => window.removeEventListener("popstate", notify); },
    () => window.location.search || (() => {
      const stored = window.localStorage.getItem("squeez.deploymentTarget");
      if (!stored) return "";
      const [chain, network] = stored.split(":");
      return `?chain=${encodeURIComponent(chain)}&network=${encodeURIComponent(network)}`;
    })(),
    () => "",
  );
  const search = new URLSearchParams(query);
  let target = deploymentTarget;
  try {
    const chain = search.get("chain") ?? deploymentTarget.chain;
    const stage = search.get("network") ?? deploymentTarget.stage;
    target = parseDeploymentTarget(chain, stage);
  } catch {
    target = deploymentTarget;
  }
  const info = SQUEEZ_NETWORKS[deploymentTargetId(target)];
  const chain = supportedChains.find((candidate) => candidate.id === info.chainId)!;
  return { target, info, chain, id: deploymentTargetId(target),
    targetApiUrl: `${apiUrl}/v1/${target.chain}/${target.stage}` };
}
