"use client";

import { STAGES, type Stage } from "@squeez/shared";
import clsx from "clsx";
import { useDeploymentRegistry } from "@/lib/deployments";
import { useSelectedTarget } from "@/lib/use-selected-target";

const stageLabel = (stage: Stage) => stage === "mainnet" ? "Mainnet" : "Testnet";

export function NetworkSelector() {
  const selected = useSelectedTarget();
  const registry = useDeploymentRegistry();

  const selectStage = (stage: Stage) => {
    if (stage === selected.target.stage) return;
    const url = new URL(window.location.href);
    const tokenRoute = url.pathname.match(/^\/token\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/0x[a-fA-F0-9]{40}\/?$/);
    if (tokenRoute) url.pathname = "/explore";
    url.searchParams.set("network", stage);
    if (url.pathname === "/explore") url.searchParams.delete("chain");
    else url.searchParams.set("chain", selected.target.chain);
    window.localStorage.setItem("squeez.deploymentTarget", `${selected.target.chain}:${stage}`);
    window.location.assign(url.toString());
  };

  const liveCount = (stage: Stage) => registry.data?.filter((target) => target.stage === stage
    && (target.capability === "enabled" || target.capability === "read-only")).length ?? 0;

  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-surface px-3 text-left text-xs text-white transition-colors hover:border-muted [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" />
        <span>{stageLabel(selected.target.stage)}</span>
        <span className="num hidden text-[10px] text-muted sm:inline">{liveCount(selected.target.stage)} chains</span>
        <span aria-hidden className="ml-1 text-[10px] text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-md border border-line bg-surface shadow-2xl">
        <div className="border-b border-line px-3 py-2">
          <p className="text-xs font-medium text-white">Environment</p>
          <p className="mt-0.5 text-[11px] text-muted">Explore combines every active chain in this mode.</p>
        </div>
        <div className="p-1">
          {STAGES.map((stage) => {
            const active = stage === selected.target.stage;
            const count = liveCount(stage);
            const available = active || count > 0;
            return (
              <button
                key={stage}
                type="button"
                disabled={!available}
                onClick={() => available && selectStage(stage)}
                aria-current={active ? "true" : undefined}
                className={clsx(
                  "flex w-full items-center gap-3 rounded px-3 py-3 text-left",
                  active ? "bg-bg text-white" : available ? "text-white hover:bg-bg" : "cursor-not-allowed text-muted opacity-60",
                )}
              >
                <span aria-hidden className={clsx("h-2.5 w-2.5 rounded-full", active ? "bg-emerald-400 ring-4 ring-emerald-400/10" : available ? "bg-white/60" : "bg-muted/40")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{stageLabel(stage)}</span>
                  <span className="num block text-[10px] uppercase text-muted">{count ? `${count} active chains` : "No active chains"}</span>
                </span>
                <span className={clsx("rounded border px-1.5 py-0.5 text-[9px] uppercase", active ? "border-emerald-400/40 text-emerald-300" : "border-line text-muted")}>
                  {active ? "Active" : available ? "Switch" : "Unavailable"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="border-t border-line px-3 py-2 text-[10px] leading-relaxed text-muted">Choose a specific chain inside Launch. Token pages keep their canonical chain automatically.</p>
      </div>
    </details>
  );
}
