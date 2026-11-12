"use client";

import { SQUEEZ_NETWORKS, type SqueezNetworkInfo } from "@squeez/shared";
import clsx from "clsx";
import { useDeploymentRegistry, type DeploymentCapability } from "@/lib/deployments";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { useProtocolConfig } from "@/lib/protocol-config";

const options = Object.values(SQUEEZ_NETWORKS) as SqueezNetworkInfo[];

function Dot({ active }: { active: boolean }) {
  return <span aria-hidden className={clsx("h-2 w-2 rounded-full", active ? "bg-emerald-400" : "bg-muted/50")} />;
}

export function NetworkSelector() {
  const selected = useSelectedTarget();
  const activeId = selected.id;
  const registry = useDeploymentRegistry();
  const protocol = useProtocolConfig();
  const capabilities = new Map(registry.data?.map((target) => [`${target.chain}:${target.stage}`, target.capability]));
  const label = (capability: DeploymentCapability, active: boolean) => capability === "enabled"
    ? (active ? "Active" : "Available")
    : capability === "read-only" ? "Read only"
      : capability === "maintenance" ? "Maintenance" : "Coming soon";

  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-line bg-surface px-3 text-left text-xs text-white transition-colors hover:border-muted [&::-webkit-details-marker]:hidden">
        <Dot active />
        <span className="hidden max-w-32 truncate sm:inline">{selected.info.name}</span>
        <span className="sm:hidden">{selected.info.shortName}</span>
        <span className="num text-[10px] text-muted">{selected.info.nativeCurrency.symbol}</span>
        <span aria-hidden className="ml-1 text-[10px] text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>

      <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-md border border-line bg-surface shadow-2xl">
        <div className="border-b border-line px-3 py-2">
          <p className="text-xs font-medium text-white">Chain &amp; network</p>
          <p className="mt-0.5 text-[11px] text-muted">Contracts and on-chain data change together.</p>
        </div>
        <div className="p-1">
          {options.map((option) => {
            const id = `${option.chain}:${option.stage}`;
            const active = id === activeId;
            const capability = active && protocol.data?.capability
              ? protocol.data.capability
              : capabilities.get(id) ?? (active ? "enabled" : "coming-soon");
            const available = capability === "enabled" || capability === "read-only";
            return (
              <button
                key={id}
                type="button"
                disabled={!available}
                onClick={() => {
                  if (active || !available) return;
                  const url = new URL(window.location.href);
                  url.searchParams.set("chain", option.chain);
                  url.searchParams.set("network", option.stage);
                  window.localStorage.setItem("squeez.deploymentTarget", id);
                  window.location.assign(url.toString());
                }}
                aria-current={active ? "true" : undefined}
                title={active ? `Currently using ${option.name}` : `${option.name}: ${label(capability, false)}`}
                className={clsx(
                  "flex w-full items-center gap-3 rounded px-3 py-2.5 text-left",
                  active ? "bg-bg text-white" : available ? "text-white hover:bg-bg" : "cursor-not-allowed text-muted opacity-60",
                )}
              >
                <Dot active={active} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{option.name}</span>
                  <span className="num block text-[10px] uppercase text-muted">
                    Chain {option.chainId} · {option.nativeCurrency.symbol}
                  </span>
                </span>
                <span className={clsx("rounded border px-1.5 py-0.5 text-[9px] uppercase", active ? "border-emerald-400/40 text-emerald-300" : "border-line text-muted")}>
                  {registry.isError && active ? "Registry offline" : label(capability, active)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </details>
  );
}
