import Link from "next/link";
import { landing as L, tokens } from "@/lib/data";
import { fmtNum, pad } from "@/lib/format";
import { tokenMarket } from "@/lib/market";
import type { Token } from "@/lib/types";
import { Progress } from "@/components/ui";
import { PairBadge, TokenAvatar } from "@/components/token-bits";
import { IconArrowRight } from "@/components/icons";
import { SectionLabel, SectionTitle, labelCls, normalWidth, revealDelay } from "../primitives";

/** Curve tokens closest to graduation. */
const nearGraduation = (limit = 6) =>
  tokens.filter((t) => t.status === "curve").sort((a, b) => b.hypeRaised - a.hypeRaised).slice(0, limit);

function LiveTokenCard({ token, index }: { token: Token; index: number }) {
  const m = tokenMarket(token);
  return (
    <Link href={`/token/${token.address}`} className="group flex h-full flex-col border border-line p-5 transition-colors hover:border-white">
      <div className="flex items-center justify-between">
        <span className={labelCls}>#{pad(index + 1)}</span>
        <PairBadge quote={token.quote} />
      </div>
      <div className="mt-10 flex items-center gap-3">
        <TokenAvatar token={token} size={44} />
        <div className="min-w-0">
          <div className="truncate text-lg text-white">{token.name}</div>
          <div className="num text-xs text-muted">${token.ticker}</div>
        </div>
      </div>
      <div className="mt-8 flex items-baseline justify-between">
        <span className="font-display text-4xl font-semibold tabular-nums tracking-tight text-white" style={normalWidth}>{m.progress.toFixed(1)}%</span>
        <span className="num text-xs text-muted">{fmtNum(m.remainingHype, 1)} {L.live.leftLabel}</span>
      </div>
      <div className="mt-3"><Progress value={m.progress} /></div>
      <span className="mt-6 inline-flex items-center gap-2 text-sm text-mint group-hover:text-white">
        View details <IconArrowRight width={14} height={14} className="transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

/** 003: horizontal scroller of tokens near graduation. */
export function LiveTokensSection() {
  const V = L.live;
  return (
    <section aria-labelledby="live-title">
      <SectionLabel tag={V.label} n={3} />
      <div className="mt-8 flex flex-wrap items-end justify-between gap-4 md:mt-12">
        <SectionTitle id="live-title">{V.title}</SectionTitle>
        <div className="flex items-center gap-6 text-sm">
          <span className="num text-muted">{V.scrollHint} →</span>
          <Link href="/explore" className="ulink text-white">{V.viewAll} · {tokens.length}</Link>
        </div>
      </div>
      <ul className="snap-row -mx-4 mt-10 flex scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:scroll-px-8 md:px-8">
        {nearGraduation().map((t, i) => (
          <li key={t.address} data-reveal style={revealDelay(i * 80)} className="w-[78vw] shrink-0 sm:w-[22rem]">
            <LiveTokenCard token={t} index={i} />
          </li>
        ))}
      </ul>
      <p className="num mt-3 text-[11px] text-muted">{V.note}</p>
    </section>
  );
}
