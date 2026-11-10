"use client";
import clsx from "clsx";
import { content } from "@/lib/data";
import { Badge, ChoiceCard } from "@/components/ui";
import { QuoteDot } from "@/components/token-bits";
import { pairsForGroup, type LaunchFormApi, type PairGroup } from "./use-launch-form";

const T = content.launch.form;

function PairStatus({ status, enabled }: { status: string; enabled: boolean }) {
  if (status === "ready") return <Badge tone="primary">{T.pairStatus.ready}</Badge>;
  if (status === "confirm-address" && enabled) return <Badge tone="warn">{T.pairStatus["confirm-address"]}</Badge>;
  return <Badge tone="muted">{T.pairStatus.soon}</Badge>;
}

export function PairPicker({ api }: { api: LaunchFormApi }) {
  const { form: f, set, selectGroup } = api;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-white">{T.pairLabel}</span>
        <span className="text-xs text-muted">{T.pairHint}</span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {content.launch.pairGroups.map((g) => (
          <button
            key={g.id}
            disabled={pairsForGroup(g.id as PairGroup).length === 0}
            title={pairsForGroup(g.id as PairGroup).length === 0 ? "Enabled only after the quote asset and graduation route are verified on-chain" : undefined}
            onClick={() => selectGroup(g.id as PairGroup)}
            className={clsx("rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40", f.group === g.id ? "border-white bg-white text-bg" : "border-line bg-bg text-muted hover:text-white")}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {pairsForGroup(f.group).map((p) => (
          <ChoiceCard key={p.symbol} selected={f.quote === p.symbol} disabled={!p.enabled} onClick={() => set("quote", p.symbol)} className="flex items-center gap-3 px-3 py-2.5 disabled:opacity-50">
            <QuoteDot symbol={p.symbol} size={24} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-white">{p.symbol}</span>
              <span className="block truncate text-xs text-muted">{p.name} · {p.source}</span>
            </span>
            <PairStatus status={p.status} enabled={p.enabled} />
          </ChoiceCard>
        ))}
      </div>

      {f.group === "stock" && <Note>{T.stockNote}</Note>}
    </div>
  );
}

export const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2 border-l-2 border-white pl-3 text-xs text-white">{children}</p>
);
