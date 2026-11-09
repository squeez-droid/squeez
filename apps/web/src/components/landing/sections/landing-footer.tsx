import Link from "next/link";
import { content, landing as L } from "@/lib/data";
import { IconArrowUpRight, Logo } from "@/components/icons";
import { NegativeToggle } from "../motion";

export function LandingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-10 text-xs text-muted md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end md:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2 text-white">
            <Logo size={16} />
            <span className="font-display font-bold uppercase">{content.brand.name}</span>
          </Link>
          <p className="mt-3 max-w-md">{content.footer.disclaimer}</p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {content.footer.links.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer" className="ulink inline-flex items-center gap-1 hover:text-white">
                {l.label}<IconArrowUpRight width={11} height={11} />
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-5">
          <NegativeToggle on={L.motion.negativeOn} off={L.motion.negativeOff} />
          <span className="num">{L.footer.copyright}</span>
          <a href="#main" className="ulink hover:text-white">{L.footer.top} ↑</a>
        </div>
      </div>
    </footer>
  );
}
