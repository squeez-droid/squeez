import clsx from "clsx";
import { landing as L, quotePairs } from "@/lib/data";
import { pad } from "@/lib/format";
import { SectionHead } from "../primitives";

/** 006: quote pairs grouped by category, like a stack list. */
export function PairsSection() {
  const Q = L.pairs;
  const statusLabels = Q.statusLabels as Record<string, string>;
  const categories = Object.entries(Q.categories) as [string, string][];
  return (
    <section>
      <SectionHead
        id="pairs" n={6} tag={Q.label} title={Q.title}
        aside={<>{Q.body}<span className="num mt-3 block text-xs text-muted">{Q.countLabel} · {quotePairs.length}</span></>}
      />
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        {categories.map(([key, name]) => {
          const list = quotePairs.filter((q) => q.category === key);
          return (
            <div key={key}>
              <div className="flex items-baseline justify-between border-b border-white pb-2">
                <h3 className="text-white">{name}</h3>
                <span className="num text-xs text-muted">{pad(list.length)}</span>
              </div>
              <ul>
                {list.map((q) => (
                  <li key={q.symbol} className="flex items-baseline justify-between gap-4 border-b border-line py-3 text-sm">
                    <span className="min-w-0 truncate"><span className="num text-white">{q.symbol}</span> <span className="text-muted">{q.name}</span></span>
                    <span className={clsx("num shrink-0 text-[11px] uppercase tracking-[0.08em]", q.status === "ready" ? "text-white" : "text-muted")}>{statusLabels[q.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
