import { config, landing as L } from "@/lib/data";
import { pad } from "@/lib/format";
import { SectionHead, revealDelay } from "../primitives";

const LC = config.launchConfig;
const METRICS: Record<string, string> = {
  creator: "1 tx",
  sniper: `${LC.sniperTax.startBps / 100}% → 0 / ${LC.sniperTax.decaySeconds}s`,
  maxwallet: `${LC.maxWallet.bps / 100}% cap`,
};

/** 007: numbered protection rows. */
export function ProtectionSection() {
  const R = L.protection;
  return (
    <section>
      <SectionHead id="protection" n={7} tag={R.label} title={R.title} />
      <ol className="mt-12 border-t border-line">
        {R.items.map((p, i) => (
          <li key={p.title} data-reveal style={revealDelay(i * 90)} className="group grid gap-3 border-b border-line py-6 md:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-baseline md:gap-8">
            <span className="num text-xs text-muted">{pad(i + 1)}</span>
            <h3 className="text-xl text-white md:text-2xl">{p.title}</h3>
            <p className="text-sm leading-relaxed text-mint/80">{p.body}</p>
            <span className="num text-lg text-white md:text-right">{METRICS[p.metric]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
