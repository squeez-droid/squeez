import type { ReactNode } from "react";
import { config, content, landing as L } from "@/lib/data";
import { bpsToPct, pad } from "@/lib/format";
import { SectionHead, labelCls } from "../primitives";

const P = config.protocol;

const BigFigure = ({ children }: { children: ReactNode }) => (
  <div className="wordmark mt-4 font-display font-extrabold tabular-nums text-white" style={{ fontSize: "clamp(5rem, 13vw, 11rem)" }}>{children}</div>
);

/** 005: protocol fee split + creator fee destinations. */
export function FeesSection() {
  const F = L.fees;
  return (
    <section>
      <SectionHead id="fees" n={5} tag={F.label} title={F.title} aside={F.body} />
      <div className="mt-12 grid gap-px border-y border-line bg-line md:grid-cols-2">
        <div className="bg-bg py-8 md:pr-10">
          <div className={labelCls}>{F.protocolLabel}</div>
          <BigFigure>{bpsToPct(P.PROTOCOL_FEE_BPS)}</BigFigure>
          <ul className="mt-8">
            {F.split.map((s) => (
              <li key={s.label} className="flex items-baseline justify-between gap-4 border-t border-line py-3 text-sm">
                <span className="text-mint">{s.label}</span>
                <span className="num text-white">{((s.share * P.PROTOCOL_FEE_BPS) / 100).toFixed(2)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-bg py-8 md:pl-10">
          <div className={labelCls}>{F.creatorLabel}</div>
          <BigFigure>0–{P.MAX_CREATOR_FEE_BPS / 100}%</BigFigure>
          <div className={`${labelCls} mt-8`}>{F.destTitle}</div>
          <ul className="mt-2">
            {content.launch.destinations.map((d, i) => (
              <li key={d.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-t border-line py-3 text-sm">
                <span className="num text-muted">{pad(i + 1)}</span>
                <span><span className="text-white">{d.label}</span> <span className="text-muted">· {d.body}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
