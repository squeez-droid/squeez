import { landing as L } from "@/lib/data";
import { pad } from "@/lib/format";
import { SectionHead, labelCls, normalWidth, revealDelay } from "../primitives";

/** 002: four numbered cards. */
export function MechanismSection() {
  const M = L.mechanism;
  return (
    <section>
      <SectionHead id="mechanism" n={2} tag={M.label} title={M.title} />
      <ol className="mt-12 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {M.steps.map((s, i) => (
          <li key={s.title} data-reveal style={revealDelay(i * 90)} className="group flex flex-col bg-bg p-5 transition-colors hover:bg-surface sm:min-h-[20rem] md:p-6">
            <span className={labelCls}>#{pad(i + 1)} · {M.tags[i]}</span>
            <h3 className="mt-8 font-display text-2xl font-semibold tracking-tight text-white sm:mt-12" style={normalWidth}>{s.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-mint/80 sm:mt-auto sm:pt-6">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
