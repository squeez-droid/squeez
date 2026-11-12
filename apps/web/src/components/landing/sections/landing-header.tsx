import Link from "next/link";
import { content, landing as L } from "@/lib/data";
import { pad } from "@/lib/format";
import { BrandLogo } from "@/components/brand-logo";
import { IconArrowRight } from "@/components/icons";
import { XLink } from "@/components/x-link";

/** Symmetric technical masthead with the brand held at its visual center. */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto grid h-14 max-w-[90rem] grid-cols-[1fr_auto_1fr] items-center border-x border-line px-4 md:px-8">
        <nav aria-label={L.sectionNavLabel} className="hidden items-center gap-5 lg:flex">
          {L.nav.slice(0, 2).map((n, i) => (
            <a key={n.href} href={n.href} className="num text-[11px] uppercase tracking-[0.12em] text-muted hover:text-white">
              <span className="text-muted/60">{pad(i + 1)}</span> <span className="ulink">{n.label}</span>
            </a>
          ))}
        </nav>
        <Link href="/" className="flex items-center gap-2 border-x border-line px-4 text-white" aria-label={content.brand.name}>
          <BrandLogo size={30} priority className="shrink-0" />
          <span className="font-display text-[14px] font-bold uppercase tracking-[-0.02em]">{content.brand.name}</span>
        </Link>
        <div className="flex items-center justify-end gap-5">
          <XLink label={false} className="text-muted" />
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Secondary landing navigation">
            {L.nav.slice(2, 4).map((n, i) => (
              <a key={n.href} href={n.href} className="num text-[11px] uppercase tracking-[0.12em] text-muted hover:text-white">
                <span className="text-muted/60">{pad(i + 3)}</span> <span className="ulink">{n.label}</span>
              </a>
            ))}
          </nav>
          <Link href="/explore" className="inline-flex h-9 items-center gap-2 border border-white px-3 text-sm font-medium text-white transition-colors hover:bg-white hover:text-bg">
            App <IconArrowRight width={14} height={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}
