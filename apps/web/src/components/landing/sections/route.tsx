import { landing as L } from "@/lib/data";
import { THRESHOLD } from "@/lib/curve";
import { CurveFigure } from "../curve-figure";
import { SectionHead, normalWidth } from "../primitives";

const Endpoint = ({ name, meta, right }: { name: string; meta: string; right?: boolean }) => (
  <div className={right ? "sm:text-right" : undefined}>
    <div className="text-lg text-white md:text-2xl">{name}</div>
    <div className="num text-xs text-muted">{meta}</div>
  </div>
);

/** 001: start point → end point, with the curve as the map between them. */
export function RouteSection() {
  const R = L.route;
  return (
    <section>
      <SectionHead id="route" n={1} tag={R.label} title={R.title} aside={R.body} />
      <div className="mt-12 grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-8">
        <Endpoint name={R.fromName} meta={R.fromMeta} />
        <div className="relative my-4 h-px bg-line sm:my-0" aria-hidden>
          <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-white bg-bg" />
          <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 bg-white" />
          <span className="num absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap text-[11px] text-muted">{THRESHOLD} HYPE</span>
        </div>
        <Endpoint name={R.toName} meta={R.toMeta} right />
      </div>
      <p className="mt-10 font-display text-xl italic text-mint md:text-2xl" style={normalWidth}>{R.tagline}</p>
      <div className="mt-10"><CurveFigure caption={R.curveCaption} /></div>
    </section>
  );
}
