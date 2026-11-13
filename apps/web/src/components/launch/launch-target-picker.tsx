"use client";

import { CHAINS, STAGES, SQUEEZ_NETWORKS, deploymentTargetId, type SqueezChain, type Stage } from "@squeez/shared";
import clsx from "clsx";
import { ChainLogo, chainLabel } from "@/components/chain-logo";
import { useDeploymentRegistry, type DeploymentCapability } from "@/lib/deployments";
import { useSelectedTarget } from "@/lib/use-selected-target";

const capabilityLabel = (capability: DeploymentCapability) => capability === "enabled"
  ? "Launch live"
  : capability === "read-only" ? "Read only"
    : capability === "maintenance" ? "Maintenance" : "Coming soon";

function navigate(chain: SqueezChain, stage: Stage) {
  const url = new URL(window.location.href);
  url.searchParams.set("chain", chain);
  url.searchParams.set("network", stage);
  window.localStorage.setItem("squeez.deploymentTarget", `${chain}:${stage}`);
  window.location.assign(url.toString());
}

export function LaunchTargetPicker() {
  const selected = useSelectedTarget();
  const registry = useDeploymentRegistry();
  const capabilities = new Map(registry.data?.map((target) => [`${target.chain}:${target.stage}`, target.capability]));

  return (
    <section className="mt-5 border border-line bg-surface p-4" aria-labelledby="launch-network-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="launch-network-title" className="text-sm font-semibold text-white">Launch network</h2>
          <p className="mt-1 text-xs text-muted">Choose where the token, curve, metadata and future liquidity pool will live.</p>
        </div>
        <div className="inline-flex w-fit rounded-md border border-line bg-bg p-1">
          {STAGES.map((stage) => (
            <button key={stage} type="button" onClick={() => navigate(selected.target.chain, stage)}
              className={clsx("rounded px-3 py-1.5 text-xs font-medium capitalize", selected.target.stage === stage ? "bg-white text-bg" : "text-muted hover:text-white")}
              aria-pressed={selected.target.stage === stage}>{stage}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {CHAINS.map((chain) => {
          const target = { chain, stage: selected.target.stage } as const;
          const info = SQUEEZ_NETWORKS[deploymentTargetId(target)];
          const active = chain === selected.target.chain;
          const capability = capabilities.get(deploymentTargetId(target)) ?? (active ? "enabled" : "coming-soon");
          const available = capability === "enabled" || capability === "read-only";
          return (
            <button key={chain} type="button" disabled={!available} onClick={() => !active && available && navigate(chain, selected.target.stage)}
              className={clsx("relative flex items-center gap-3 rounded-md border p-3 text-left transition",
                active ? "border-primary bg-primary/10" : available ? "border-line bg-bg hover:border-muted" : "cursor-not-allowed border-line bg-bg opacity-45")}
              aria-pressed={active} title={`${chainLabel(chain)} ${selected.target.stage}: ${capabilityLabel(capability)}`}>
              <ChainLogo chain={chain} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{chainLabel(chain)}</span>
                <span className="num block text-[10px] text-muted">{info.nativeCurrency.symbol} · {capabilityLabel(capability)}</span>
              </span>
              {active && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-400" aria-label="Selected" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">Pair assets below are specific to the selected chain. Unverified routes remain disabled.</p>
    </section>
  );
}
