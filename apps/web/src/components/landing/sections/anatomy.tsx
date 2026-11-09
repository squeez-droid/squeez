import { config, landing as L } from "@/lib/data";
import { fmtNum, pad } from "@/lib/format";
import { SectionHead } from "../primitives";

/** 5/7 sold on the curve, 10/49 locked LP, 4/49 in the locker (see lib/curve.ts). */
const SUPPLY_SPLIT = [
  { frac: 5 / 7, cls: "bg-white" },
  { frac: 10 / 49, cls: "bg-muted" },
  { frac: 4 / 49, cls: "hatch" },
];

/** 004: supply split bar + table. */
export function AnatomySection() {
  const A = L.anatomy;
  const supply = SUPPLY_SPLIT.map((s, i) => ({ ...s, label: A.supplyLabels[i] }));
  return (
    <section>
      <SectionHead id="anatomy" n={4} tag={A.label} title={A.title} aside={<span className="num text-xs text-muted">{A.meta}</span>} />
      <div data-reveal className="mt-12 flex h-20 w-full overflow-hidden border border-line md:h-28" role="img" aria-label={A.ariaLabel}>
        {supply.map((s) => <div key={s.label} className={s.cls} style={{ width: `${s.frac * 100}%` }} />)}
      </div>
      <ol className="mt-2">
        {supply.map((s, i) => (
          <li key={s.label} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-line py-4">
            <span className="num text-xs text-muted">{pad(i + 1)}</span>
            <span className="flex items-center gap-3 text-white">
              <span aria-hidden className={`h-3 w-3 shrink-0 border border-line ${s.cls}`} />
              {s.label}
            </span>
            <span className="num text-right text-sm text-muted">
              <span className="hidden sm:inline">{fmtNum(Math.round(s.frac * config.launchConfig.totalSupply), 0)} · </span>
              <span className="text-white">{(s.frac * 100).toFixed(2)}%</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
