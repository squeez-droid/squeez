import { landing as L } from "@/lib/data";
import { THRESHOLD } from "@/lib/curve";
import { ChainClock, Counter } from "../landing-bits";
import { DitherCurve } from "../motion";
import { Container, CtaLink, labelCls, normalWidth } from "../primitives";

/** Counter, split wordmark, meta row, hero figure and statement. */
export function HeroSection() {
  const H = L.hero;
  return (
    <section>
      <Container className="pb-20 pt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white"><Counter to={100} from={H.counter} /></span>
          <span className={labelCls}>[ Index ]</span>
        </div>

        <h1 className="mt-10 font-display font-extrabold text-white md:mt-16" aria-label={`${H.wordTop} ${H.wordBottom}`}>
          <span className="block overflow-hidden pb-[0.04em]">
            <span className="rise wordmark" style={{ fontSize: "clamp(4rem, 19vw, 17rem)" }}>{H.wordTop}</span>
          </span>
          <span className="block overflow-hidden pb-[0.06em] md:pl-[18vw]">
            <span className="rise wordmark text-muted" style={{ fontSize: "clamp(2.6rem, 14.5vw, 13rem)", animationDelay: "120ms" }}>{H.wordBottom}</span>
          </span>
        </h1>

        <dl className="mt-12 grid gap-px border-y border-line bg-line sm:grid-cols-3 md:mt-16">
          <div className="bg-bg py-4 sm:pr-6">
            <dt className={labelCls}>Network</dt>
            <dd className="mt-2 text-white">{H.location}</dd>
            <dd className="text-sm text-muted">{H.role}</dd>
          </div>
          <div className="bg-bg py-4 sm:px-6">
            <dt className={labelCls}>Focus</dt>
            <dd className="mt-2 text-white">{H.keywords.join(" • ")}.</dd>
          </div>
          <div className="bg-bg py-4 sm:pl-6">
            <dt className={labelCls}>{H.clockLabel}</dt>
            <dd className="mt-2 font-display text-3xl font-semibold tracking-tight text-white" style={normalWidth}><ChainClock /></dd>
          </div>
        </dl>

        <figure className="mt-px border-b border-line">
          <div className="relative h-[46vh] min-h-[16rem] w-full md:h-[58vh]">
            <DitherCurve />
            <span className="num pointer-events-none absolute left-3 top-3 bg-bg px-1.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-white">[ {L.figures.hero.label} ]</span>
            <span className="num pointer-events-none absolute bottom-3 right-3 bg-bg px-1.5 py-0.5 text-[11px] text-white">0 → {THRESHOLD} HYPE</span>
          </div>
          <figcaption className="flex flex-wrap justify-between gap-2 py-3 text-xs">
            <span className="text-white">{L.figures.hero.title}</span>
            <span className="num text-muted">{L.figures.hero.meta}</span>
          </figcaption>
        </figure>

        <div className="mt-16 grid gap-10 md:mt-24 md:grid-cols-[12rem_minmax(0,1fr)]">
          <span className={labelCls}>[ About ]</span>
          <div>
            <p data-reveal className="max-w-4xl text-[1.6rem] leading-[1.2] tracking-[-0.02em] text-mint md:text-[2.6rem]">
              <span className="font-display font-semibold text-white" style={normalWidth}>{H.statement}</span> {H.body}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-5">
              <span className="num text-xs text-muted">{H.signature}</span>
              <div className="flex flex-wrap gap-3">
                <CtaLink href="/explore" arrow>{H.primaryCta}</CtaLink>
                <CtaLink href="/launch" variant="outline">{H.secondaryCta}</CtaLink>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
