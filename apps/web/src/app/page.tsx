import Link from "next/link";
import { content } from "@/lib/data";

export default function Landing() {
  return (
    <main className="min-h-dvh bg-bg text-white">
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-6 md:px-8">
        <header className="flex items-center justify-between border-b border-line pb-5">
          <span className="font-display text-xl font-bold uppercase">{content.brand.name}</span>
          <Link href="/explore" className="text-sm text-muted hover:text-white">Open app →</Link>
        </header>
        <section className="flex flex-1 items-center py-20">
          <div className="max-w-4xl">
            <p className="num text-xs uppercase tracking-[0.16em] text-muted">Fixed-supply launchpad on Elysium</p>
            <h1 className="mt-5 font-display text-5xl font-bold uppercase leading-[0.95] md:text-8xl">
              Launch on a HYPE bonding curve.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
              Tokens launch with a fixed one-billion supply and no creator allocation, then graduate into locked
              Uniswap v4 liquidity. Live parameters and market data appear only after verified contracts and the
              indexer are configured.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/explore" className="rounded-md bg-white px-5 py-3 text-sm font-medium text-bg">Explore</Link>
              <Link href="/launch" className="rounded-md border border-line px-5 py-3 text-sm text-white hover:border-white">Launch token</Link>
            </div>
          </div>
        </section>
        <footer className="border-t border-line pt-5 text-xs text-muted">
          Testnet configuration is required. No sample market or wallet data is shown.
        </footer>
      </div>
    </main>
  );
}
