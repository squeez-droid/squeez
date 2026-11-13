"use client";

import {
  SQUEEZ_NETWORKS, deploymentTargetId, parseDeploymentTarget, type DeploymentTarget,
} from "@squeez/shared";
import { useSyncExternalStore } from "react";
import { apiUrl, deploymentTarget, supportedChains } from "./chain";

const TARGET_CHANGE_EVENT = "squeez:deployment-target-change";

/**
 * Updates the selected deployment without reloading the document. Keeping the
 * current React tree mounted is important on /launch, where a creator may have
 * already entered metadata or selected an image before comparing networks.
 */
export function selectDeploymentTarget(
  target: DeploymentTarget,
  options?: { replace?: boolean; includeChainInUrl?: boolean },
) {
  const url = new URL(window.location.href);
  if (options?.includeChainInUrl === false) url.searchParams.delete("chain");
  else url.searchParams.set("chain", target.chain);
  url.searchParams.set("network", target.stage);
  window.localStorage.setItem("squeez.deploymentTarget", deploymentTargetId(target));
  window.history[options?.replace ? "replaceState" : "pushState"]({}, "", url);
  window.dispatchEvent(new Event(TARGET_CHANGE_EVENT));
}

export function useSelectedTarget() {
  const location = useSyncExternalStore(
    (notify) => {
      window.addEventListener("popstate", notify);
      window.addEventListener(TARGET_CHANGE_EVENT, notify);
      return () => {
        window.removeEventListener("popstate", notify);
        window.removeEventListener(TARGET_CHANGE_EVENT, notify);
      };
    },
    () => `${window.location.pathname}${window.location.search}`,
    () => "",
  );
  const queryStart = location.indexOf("?");
  const pathname = queryStart >= 0 ? location.slice(0, queryStart) : location;
  const query = queryStart >= 0 ? location.slice(queryStart) : "";
  const canonicalTokenTarget = pathname.match(/^\/token\/(elysium|hyperevm|robinhood)\/(testnet|mainnet)\/0x[a-fA-F0-9]{40}\/?$/);
  const storedQuery = query || (() => {
      if (typeof window === "undefined") return "";
      const stored = window.localStorage.getItem("squeez.deploymentTarget");
      if (!stored) return "";
      const [chain, network] = stored.split(":");
      return `?chain=${encodeURIComponent(chain)}&network=${encodeURIComponent(network)}`;
    })();
  const search = new URLSearchParams(storedQuery);
  let target = deploymentTarget;
  try {
    const chain = canonicalTokenTarget?.[1] ?? search.get("chain") ?? deploymentTarget.chain;
    const stage = canonicalTokenTarget?.[2] ?? search.get("network") ?? deploymentTarget.stage;
    target = parseDeploymentTarget(chain, stage);
  } catch {
    target = deploymentTarget;
  }
  const info = SQUEEZ_NETWORKS[deploymentTargetId(target)];
  const chain = supportedChains.find((candidate) => candidate.id === info.chainId)!;
  return { target, info, chain, id: deploymentTargetId(target),
    targetApiUrl: `${apiUrl}/v1/${target.chain}/${target.stage}` };
}
