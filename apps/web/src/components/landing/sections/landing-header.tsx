import Link from "next/link";
import { content, landing as L } from "@/lib/data";
import { pad } from "@/lib/format";
import { BrandLogo } from "@/components/brand-logo";
import { IconArrowRight } from "@/components/icons";
import { ChainClock } from "../landing-bits";

/** Sticky top bar: mark, section index, chain clock, app link. */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-6 px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2 text-white" aria-label={content.brand.name}>
          <BrandLogo size={34} priority className="shrink-0" />
          <span className="font-display text-[15px] font-bold uppercase tracking-tight">{content.brand.name}</span>
        </Link>
        <nav aria-label={L.sectionNavLabel} className="hidden items-center gap-5 lg:flex">
          {L.nav.map((n, i) => (
            <a key={n.href} href={n.href} className="num text-[11px] uppercase tracking-[0.12em] text-muted hover:text-white">
              <span className="text-muted/60">{pad(i + 1)}</span> <span className="ulink">{n.label}</span>
            </a>
          ))}
        </nav>
        <span className="ml-auto hidden text-[11px] uppercase tracking-[0.12em] text-muted sm:inline">
          <span className="num">UTC</span> <ChainClock seconds={false} />
        </span>
        <Link href="/explore" className="ml-auto inline-flex h-9 items-center gap-2 border border-white px-3 text-sm font-medium text-white transition-colors hover:bg-white hover:text-bg sm:ml-0">
          {L.hero.primaryCta}
          <IconArrowRight width={14} height={14} />
        </Link>
      </div>
    </header>
  );
}
