import { THRESHOLD, SUPPLY } from "@/lib/curve";
import { HYPE_USD } from "@/lib/market";
import { fmtPrice, fmtUsd } from "@/lib/format";

// Bonding curve diagram computed from config.json (not an illustration).
export function CurveFigure({ caption }: { caption: string }) {
  // The landing page is also rendered before the runtime/on-chain config is
  // available. Keep the diagram informative in that state instead of feeding
  // a zero threshold into the SVG coordinate calculations.
  const threshold = THRESHOLD > 0 ? THRESHOLD : 0.1;
  const supply = SUPPLY > 0 ? SUPPLY : 1_000_000_000;
  const virtualHype = threshold * 0.4;
  const virtualTokens = supply;
  const invariant = virtualHype * virtualTokens;
  const displayPriceAt = (raised: number) => (virtualHype + raised) ** 2 / invariant;
  const W = 1200, H = 380, padL = 8, padR = 8, padT = 40, padB = 36;
  const N = 80;
  const p0 = displayPriceAt(0), p1 = displayPriceAt(threshold);
  const x = (r: number) => padL + (r / threshold) * (W - padL - padR);
  const y = (p: number) => H - padB - ((p - p0) / (p1 - p0)) * (H - padT - padB);
  const pts = Array.from({ length: N + 1 }, (_, i) => (threshold * i) / N).map((r) => [x(r), y(displayPriceAt(r))] as const);
  const d = pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const area = `${d} L${x(threshold)},${H - padB} L${x(0)},${H - padB} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * threshold);
  const mult = p1 / p0;

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Bonding curve from 0 to ${threshold} HYPE. Price at graduation is ${mult.toFixed(2)} times the launch price.`}>
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(250 250 250 / 0.14)" strokeWidth="1" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={padT - 12} y2={H - padB} stroke="#262626" />
            <text x={x(t) + (t === threshold ? -6 : 6)} y={H - 12} textAnchor={t === threshold ? "end" : "start"} fill="#8C8C8C" fontSize="14" fontFamily="var(--font-mono)">{Number(t.toFixed(3))} HYPE</text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#525252" />
        <path d={area} fill="url(#hatch)" />
        <path d={d} fill="none" stroke="#FAFAFA" strokeWidth="2.5" className="draw" style={{ ["--len" as string]: 1500 }} />
        <circle cx={x(0)} cy={y(p0)} r="5" fill="#000" stroke="#FAFAFA" strokeWidth="2" />
        <rect x={x(threshold) - 7} y={y(p1) - 7} width="14" height="14" fill="#FAFAFA" />
        <text x={x(0) + 16} y={y(p0) - 14} fill="#D4D4D4" fontSize="14" fontFamily="var(--font-mono)">launch · {fmtPrice(p0)} HYPE · mcap {fmtUsd(p0 * supply * HYPE_USD)}</text>
        <text x={x(threshold) - 20} y={y(p1) + 5} textAnchor="end" fill="#FAFAFA" fontSize="14" fontFamily="var(--font-mono)">graduation · {mult.toFixed(2)}× · mcap {fmtUsd(p1 * supply * HYPE_USD)} → Uniswap v4</text>
      </svg>
      <figcaption className="mt-3 max-w-xl text-xs text-muted">{caption}</figcaption>
    </figure>
  );
}
