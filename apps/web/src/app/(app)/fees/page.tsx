"use client";
import { useState } from "react";
import { config, content, stats } from "@/lib/data";
import { THRESHOLD } from "@/lib/curve";
import { bpsToPct, fmtCompact, fmtNum, fmtUsd } from "@/lib/format";
import { Card, Row } from "@/components/ui";
import { useSelectedTarget } from "@/lib/use-selected-target";

const P = config.protocol;

export default function FeesPage() {
  const nativeSymbol = useSelectedTarget().info.nativeCurrency.symbol;
  const [creatorBps, setCreatorBps] = useState(200);
  const [amount, setAmount] = useState(100);
  const burn = (amount * P.PROTOCOL_FEE_BPS * P.BURN_BPS_OF_PROTOCOL) / 1e8;
  const treasury = (amount * P.PROTOCOL_FEE_BPS * (10000 - P.BURN_BPS_OF_PROTOCOL)) / 1e8;
  const creator = (amount * creatorBps) / 10000;
  const net = amount - burn - treasury - creator;
  const maxBurn = Math.max(...stats.burnHistory.map((b) => b.squeez));

  const flows = [
    { label: "Goes into the trade", value: net, color: "bg-surface2" },
    { label: "Buyback & burn $SQUEEZ", value: burn, color: "bg-white" },
    { label: "Treasury ops", value: treasury, color: "hatch" },
    { label: "Creator", value: creator, color: "bg-muted" },
  ];

  if (!config.configured) {
    return (
      <div className="space-y-6">
        <div className="max-w-3xl">
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-white md:text-5xl">{content.fees.title}</h1>
          <p className="mt-2 text-muted">Live launch fees, thresholds, protection parameters, and protocol statistics are unavailable until the deployed contracts and indexer are configured.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5"><div className="text-sm text-muted">Protocol fee</div><div className="mt-1 font-display text-5xl font-bold text-white">{bpsToPct(P.PROTOCOL_FEE_BPS)}</div><p className="mt-2 text-xs text-muted">Immutable protocol constant.</p></Card>
          <Card className="p-5"><div className="text-sm text-muted">Creator fee range</div><div className="mt-1 font-display text-5xl font-bold text-white">0–{bpsToPct(P.MAX_CREATOR_FEE_BPS)}</div><p className="mt-2 text-xs text-muted">Validated by the launch contract.</p></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-white md:text-5xl">{content.fees.title}</h1>
        <p className="mt-2 text-muted">{content.fees.intro}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted">Protocol fee</div>
          <div className="mt-1 font-display tabular-nums text-5xl font-bold text-white">{bpsToPct(P.PROTOCOL_FEE_BPS)}</div>
          <div className="mt-1 text-xs text-muted">Fixed. PROTOCOL_FEE_BPS = {P.PROTOCOL_FEE_BPS} (immutable)</div>
          <div className="mt-4 space-y-0.5 border-t border-line pt-3">
            <Row label="Buyback & burn $SQUEEZ" value={`${P.BURN_BPS_OF_PROTOCOL / 100}% · ${bpsToPct((P.PROTOCOL_FEE_BPS * P.BURN_BPS_OF_PROTOCOL) / 10000)}`} />
            <Row label="Treasury ops" value={`${(10000 - P.BURN_BPS_OF_PROTOCOL) / 100}% · ${bpsToPct((P.PROTOCOL_FEE_BPS * (10000 - P.BURN_BPS_OF_PROTOCOL)) / 10000)}`} />
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">Creator fee</div>
          <div className="mt-1 font-display tabular-nums text-5xl font-bold text-white">0–{bpsToPct(P.MAX_CREATOR_FEE_BPS)}</div>
          <div className="mt-1 text-xs text-muted">Set by the creator at launch in {bpsToPct(P.creatorFeeStepBps)} steps. Locked per token.</div>
          <div className="mt-4 space-y-0.5 border-t border-line pt-3 text-sm">
            {content.launch.destinations.map((d) => <Row key={d.id} label={d.label} value={<span className="text-xs text-muted">{d.badge}</span>} />)}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">Launch fee</div>
          <div className="mt-1 font-display tabular-nums text-5xl font-bold text-white">{P.launchFeeHype} <span className="text-xl text-muted">{nativeSymbol}</span></div>
          <div className="mt-1 text-xs text-muted">Flat, to treasury{P.launchFeeTbd && " (placeholder, TBD)"}.</div>
          <div className="mt-4 space-y-0.5 border-t border-line pt-3">
            <Row label="Graduation threshold" value={`${THRESHOLD} ${nativeSymbol}`} />
            <Row label="Supply on curve" value="5/7" />
            <Row label="LP + locked" value="10/49 + 4/49" />
          </div>
        </Card>
      </div>

      <Card title="Fee flow per trade">
        <div className="grid gap-6 p-5 lg:grid-cols-[320px_1fr]">
          <div className="space-y-5">
            <label className="block">
              <div className="mb-1 flex justify-between text-sm"><span className="text-white">Trade size</span><span className="num text-white">${fmtNum(amount, 0)}</span></div>
              <input type="range" min={10} max={10000} step={10} value={amount} onChange={(e) => setAmount(+e.target.value)} className="w-full" />
            </label>
            <label className="block">
              <div className="mb-1 flex justify-between text-sm"><span className="text-white">Creator fee</span><span className="num text-white">{bpsToPct(creatorBps)}</span></div>
              <input type="range" min={0} max={P.MAX_CREATOR_FEE_BPS} step={P.creatorFeeStepBps} value={creatorBps} onChange={(e) => setCreatorBps(+e.target.value)} className="w-full" />
            </label>
            <div className="rounded-lg bg-bg p-3">
              <Row label="Total fee" value={`${bpsToPct(P.PROTOCOL_FEE_BPS + creatorBps)} · $${fmtNum(burn + treasury + creator, 2)}`} />
              <p className="mt-1 text-xs text-muted">On the curve fees are taken in {nativeSymbol}. After graduation the hook takes them from the quote side.</p>
            </div>
          </div>
          <div>
            <div className="flex h-10 overflow-hidden rounded-lg">
              {flows.map((f) => <div key={f.label} className={f.color} style={{ width: `${(f.value / amount) * 100}%`, minWidth: f.value > 0 ? 3 : 0 }} title={f.label} />)}
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {flows.map((f) => (
                <li key={f.label} className="flex items-center justify-between rounded-lg border border-line bg-bg px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-white/90"><span className={`h-2.5 w-2.5 border border-line ${f.color}`} />{f.label}</span>
                  <span className="num text-sm text-white">${fmtNum(f.value, 2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Lifecycle token</h2>
        <ol className="grid gap-3 md:grid-cols-5">
          {content.fees.lifecycle.map((s, i) => (
            <li key={s.title} className="relative rounded-xl border border-line bg-surface p-4">
              <span className="num flex h-7 w-7 items-center justify-center border border-white text-xs font-semibold text-white">{i + 1}</span>
              <div className="mt-2 font-medium text-white">{s.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="$SQUEEZ burned, 7 days" action={<span className="num text-sm text-white">{fmtCompact(stats.squeezBurned)} total</span>}>
          <div className="flex h-48 items-end gap-2 p-5">
            {stats.burnHistory.map((b) => (
              <div key={b.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[10px] text-muted">{fmtCompact(b.squeez, 1)}</span>
                <div className="w-full bg-white" style={{ height: `${(b.squeez / maxBurn) * 120}px` }} title={`${b.date}: ${fmtUsd(b.usd)}`} />
                <span className="num text-[10px] text-muted">{b.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 border-t border-line text-center">
            <div className="p-3"><div className="text-xs text-muted">Protocol fee 24h</div><div className="num text-white">{fmtUsd(stats.protocolFees24hUsd)}</div></div>
            <div className="border-x border-line p-3"><div className="text-xs text-muted">To buyback</div><div className="num text-white">{fmtUsd(stats.buyback24hUsd)}</div></div>
            <div className="p-3"><div className="text-xs text-muted">To treasury</div><div className="num text-white">{fmtUsd(stats.treasury24hUsd)}</div></div>
          </div>
        </Card>
        <Card title="FAQ">
          <dl className="divide-y divide-line">
            {content.fees.faq.map((f) => (
              <div key={f.q} className="px-5 py-3">
                <dt className="text-sm font-medium text-white">{f.q}</dt>
                <dd className="mt-1 text-sm text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
