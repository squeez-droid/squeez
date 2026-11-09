"use client";
import { config, content } from "@/lib/data";
import { bpsToPct, fill } from "@/lib/format";
import type { LaunchFormApi } from "./use-launch-form";

const T = content.launch.form;
const P = config.protocol;
const TICKS = ["0%", "2.5%", "5%", "7.5%", "10%"];

export function CreatorFeeSlider({ api }: { api: LaunchFormApi }) {
  const { form: f, set } = api;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-white">{T.creatorFeeLabel}</span>
        <span className="font-display text-2xl font-bold tabular-nums text-white">{bpsToPct(f.creatorFeeBps)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={P.MAX_CREATOR_FEE_BPS}
        step={P.creatorFeeStepBps}
        value={f.creatorFeeBps}
        onChange={(e) => set("creatorFeeBps", +e.target.value)}
        className="w-full"
      />
      <div className="num mt-1 flex justify-between text-[11px] text-muted">
        {TICKS.map((t) => <span key={t}>{t}</span>)}
      </div>
      <p className="mt-2 text-xs text-muted">{fill(T.creatorFeeNote, { bps: f.creatorFeeBps })}</p>
    </div>
  );
}
