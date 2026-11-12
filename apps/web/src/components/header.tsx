"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";
import { content, tokens } from "@/lib/data";
import { WalletButton } from "./wallet-ui";
import { TokenAvatar } from "./token-bits";
import { BrandLogo } from "./brand-logo";
import { IconArrowUpRight, IconClose, IconMenu, IconSearch } from "./icons";
import { NetworkSelector } from "./network-selector";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { XLink } from "./x-link";
import { FooterReaction } from "./footer-reaction";

export function Header() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const selected = useSelectedTarget();
  const results = q.length > 0 ? tokens.filter((t) => (t.name + t.ticker + t.address).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label={content.brand.name}>
          <BrandLogo size={36} priority className="shrink-0" />
          <span className="font-display text-[17px] font-bold uppercase tracking-tight text-white">{content.brand.name}</span>
          <span className="num hidden border-l border-line pl-2 text-[11px] uppercase text-muted sm:inline">{selected.info.shortName}</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {content.nav.map((n) => {
            const active = path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={clsx("relative px-3 py-1.5 text-sm transition-colors", active ? "text-white after:absolute after:inset-x-3 after:-bottom-[17px] after:h-px after:bg-white" : "text-muted hover:text-white")}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="relative ml-auto hidden w-64 lg:block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width={14} height={14} />
          <input aria-label="Search tokens" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { router.push(`/token/${results[0].address}`); setQ(""); } }}
            placeholder="Search token, ticker, address" className="h-10 w-full rounded-md border border-line bg-bg pl-9 pr-3 text-sm text-white placeholder:text-muted outline-none focus:border-white" />
          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-12 rounded-md border border-line bg-surface p-1">
              {results.map((t) => (
                <Link key={t.address} href={`/token/${t.address}`} onClick={() => setQ("")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg">
                  <TokenAvatar token={t} size={24} />
                  <span className="text-sm text-white">{t.name}</span>
                  <span className="text-xs text-muted">${t.ticker}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <XLink label={false} className="hidden h-10 w-10 items-center justify-center border border-line text-muted sm:inline-flex" />
          <NetworkSelector />
          <WalletButton />
        </div>
        <button className="flex h-10 w-10 items-center justify-center text-white md:hidden" onClick={() => setMenu((v) => !v)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu}>{menu ? <IconClose width={20} height={20} /> : <IconMenu width={20} height={20} />}</button>
      </div>
      {menu && (
        <nav className="border-t border-line px-4 py-2 md:hidden">
          {content.nav.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMenu(false)} className="block border-b border-line py-3 font-display text-lg font-semibold uppercase text-white last:border-0">{n.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  const selected = useSelectedTarget();
  const links = selected.target.chain === "elysium"
    ? content.footer.links
    : [
        ...(selected.info.faucet ? [{ label: "Faucet", href: selected.info.faucet }] : []),
        ...(selected.info.bridge ? [{ label: "Bridge", href: selected.info.bridge }] : []),
        ...(selected.info.explorer ? [{ label: "Explorer", href: selected.info.explorer }] : []),
      ];
  return (
    <footer className="mt-16 border-t border-line">
      <FooterReaction />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo size={40} className="shrink-0" />
          <div>
            <div className="font-display text-sm font-bold uppercase text-white">{content.brand.name}</div>
            <p className="mt-1 max-w-xl">{content.footer.disclaimer}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <XLink className="text-muted" />
          {links.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">{l.label}<IconArrowUpRight width={12} height={12} /></a>)}
        </div>
      </div>
    </footer>
  );
}
