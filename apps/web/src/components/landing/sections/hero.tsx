import { landing as L } from "@/lib/data";
import { THRESHOLD } from "@/lib/curve";
import { ChainClock } from "../landing-bits";
import { DitherCurve } from "../motion";
import { Container, CtaLink, labelCls, normalWidth } from "../primitives";

/** Monumental launch terminal: protocol metadata, live curve and a direct path into the app. */
export function HeroSection() {
  const H = L.hero;
  return (
    <section className="landing-hero-shell">
      <Container className="relative flex min-h-[calc(100svh-3.5rem)] flex-col border-x border-line px-0 md:px-0">
        <div className="hero-meta-grid">
          <div><span className={labelCls}>Protocol</span><strong>SQUEEZ<br />LAUNCHPAD</strong></div>
          <div><span className={labelCls}>Networks</span><strong>ELYSIUM<br />ROBINHOOD CHAIN</strong></div>
          <div><span className={labelCls}>System</span><strong>CURVE · V4 · LOCK<br />ONCHAIN ONLY</strong></div>
          <div className="text-right"><span className={labelCls}>Chain time</span><strong className="num"><ChainClock seconds={false} /></strong></div>
        </div>

        <div className="hero-stage">
          <div className="hero-dither" aria-hidden><DitherCurve cell={3} /></div>
          <div className="hero-grid-noise" aria-hidden />
          <div className="hero-copy">
            <span className="num text-[11px] uppercase tracking-[0.14em] text-muted">● [ LIVE ] · TESTNET RELEASE</span>
            <h1 className="mt-5 font-display text-[clamp(3.2rem,7.4vw,7.5rem)] font-semibold uppercase leading-[0.82] tracking-[-0.055em] text-white" style={normalWidth}>
              Fair launches.<br />Locked liquidity.
            </h1>
          </div>
          <aside className="hero-brief">
            <p>{H.body}</p>
            <div className="mt-6 grid grid-cols-2 gap-px bg-line">
              <CtaLink href="/explore" variant="outline">{H.primaryCta}</CtaLink>
              <CtaLink href="/launch" arrow>{H.secondaryCta}</CtaLink>
            </div>
          </aside>
          <div className="hero-curve-readout">
            <span>[ CURVE 01 ]</span><span>0 → {THRESHOLD} NATIVE</span>
          </div>
        </div>

        <div className="hero-marquee" aria-hidden="true">
          <div className="hero-marquee-track">
            {[0, 1].map((copy) => (
              <div className="hero-marquee-set" key={copy}>
                <span className="solid">SQUEEZ</span><i>✦</i>
                <span className="outline">LAUNCH</span><i>✦</i>
                <span className="outline">CURVE</span><i>✦</i>
                <span className="solid">GRADUATE</span><i>✦</i>
                <span className="outline">LOCK</span><i>✦</i>
                <span className="solid">PROTECT</span><i>✦</i>
              </div>
            ))}
          </div>
          <p>ONCHAIN LAUNCHES · PROGRAMMABLE LIQUIDITY · NO WITHDRAW PATH</p>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 md:px-8">
          <span className="num text-[10px] uppercase tracking-[0.14em] text-muted">Bonding curve protocol — 2026</span>
          <a href="#route" className="num text-[10px] uppercase tracking-[0.14em] text-white">Scroll ↓</a>
        </div>
      </Container>

      <Container className="py-20 md:py-28">
        <div className="grid gap-10 md:grid-cols-[12rem_minmax(0,1fr)]">
          <span className={labelCls}>[ Manifesto ]</span>
          <div>
            <p data-reveal className="max-w-5xl text-[1.65rem] leading-[1.16] tracking-[-0.025em] text-mint md:text-[3rem]">
              <span className="font-display font-semibold uppercase text-white" style={normalWidth}>{H.statement}</span> {H.body}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-5">
              <span className="num text-xs text-muted">{H.signature}</span>
              <span className="num text-xs uppercase tracking-[0.12em] text-white">Curve → Graduate → Lock</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
