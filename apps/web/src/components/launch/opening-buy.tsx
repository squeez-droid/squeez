"use client";
import { content } from "@/lib/data";
import { fill, fmtNum } from "@/lib/format";
import { useWallet } from "@/providers/wallet";
import { AffixInput, Field } from "@/components/ui";
import type { LaunchFormApi } from "./use-launch-form";

const T = content.launch.form;

export function OpeningBuy({ api }: { api: LaunchFormApi }) {
  const w = useWallet();
  const { form: f, set, opening, openingQuote, openingPct } = api;

  const hint = opening > 0
    ? fill(T.openingEstimate, { amount: fmtNum(openingQuote.outAmount, 0), ticker: f.ticker || "token", pct: openingPct.toFixed(2) })
    : T.openingHint;

  return (
    <Field
      label={T.openingLabel}
      right={w.status === "connected" ? `Balance ${fmtNum(w.balances.HYPE ?? 0, 3)} HYPE` : undefined}
      hint={hint}
      error={api.economicsErrors.opening}
    >
      <AffixInput type="number" min={0} step="0.1" suffix="HYPE" className="num" value={f.openingBuy} onChange={(e) => set("openingBuy", e.target.value)} placeholder="0.0" />
      <div className="mt-2 flex gap-1.5">
        {T.openingPresets.map((v) => (
          <button key={v} type="button" onClick={() => set("openingBuy", String(v))} className="num rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-white">
            {v} HYPE
          </button>
        ))}
      </div>
    </Field>
  );
}
