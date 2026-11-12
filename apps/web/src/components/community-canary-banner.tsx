"use client";

import { useCommunityCanary } from "@/lib/community-canary";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { Button } from "./ui";

export function CommunityCanaryBanner() {
  const selected = useSelectedTarget();
  const canary = useCommunityCanary();
  if (!canary.isMainnet) return null;

  if (!canary.open) {
    return (
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-2 text-xs text-muted">
          <span className="font-semibold text-white">{selected.chain.name} mainnet:</span>{" "}
          on-chain reads are available. Community launch and trading are still paused while the production canary is prepared.
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-warn/40 bg-warn/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 text-xs text-warn sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-semibold text-white">Mainnet community canary.</span>{" "}
          Transactions use real {selected.info.nativeCurrency.symbol}. Contracts are unaudited; use a separate wallet and only funds you can afford to lose.
          {canary.release?.maxOpeningBuyNative && <> Opening buy cap: {canary.release.maxOpeningBuyNative} {selected.info.nativeCurrency.symbol}.</>}
        </div>
        {canary.acknowledged
          ? <span className="shrink-0 font-semibold text-white">Risk acknowledged</span>
          : <Button size="sm" variant="secondary" className="shrink-0" onClick={canary.accept}>I understand the risk</Button>}
      </div>
    </div>
  );
}
