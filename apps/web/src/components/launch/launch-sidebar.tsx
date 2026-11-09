"use client";
import { config, content } from "@/lib/data";
import { SUPPLY, THRESHOLD, priceAt } from "@/lib/curve";
import { bpsToPct, fill, fmtUsd } from "@/lib/format";
import { HYPE_USD } from "@/lib/market";
import { Card, Row, Swatch } from "@/components/ui";
import { PairBadge, TokenAvatar } from "@/components/token-bits";
import { IconShield } from "@/components/icons";
import type { LaunchFormApi } from "./use-launch-form";

const T = content.launch.preview;
const P = config.protocol;
const LC = config.launchConfig;

const burnBps = (P.PROTOCOL_FEE_BPS * P.BURN_BPS_OF_PROTOCOL) / 10000;
const treasuryBps = P.PROTOCOL_FEE_BPS - burnBps;
/** Bar widths are scaled against the 11% maximum (1% protocol + 10% creator). */
const barPct = (bps: number) => `${bps / 11}%`;

function TokenPreview({ api }: { api: LaunchFormApi }) {
  const f = api.form;
  return (
    <Card title={T.title}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {f.image ? <TokenAvatar token={{ image: f.image, ticker: f.ticker }} size={52} /> : <div className="h-[52px] w-[52px] rounded-md border border-dashed border-line" />}
          <div className="min-w-0">
            <div className="truncate font-semibold text-white">{f.name || T.namePlaceholder}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span>${f.ticker || T.tickerPlaceholder}</span>
              <PairBadge quote={f.quote} />
            </div>
          </div>
        </div>
        <p className="mt-3 line-clamp-3 text-sm text-muted">{f.description || T.descriptionPlaceholder}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <MiniStat label={T.startMcap} value={fmtUsd(priceAt(0) * SUPPLY * HYPE_USD)} />
          <MiniStat label={T.gradMcap} value={fmtUsd(priceAt(THRESHOLD) * SUPPLY * HYPE_USD)} />
        </div>
      </div>
    </Card>
  );
}

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-bg p-2">
    <div className="text-muted">{label}</div>
    <div className="num text-white">{value}</div>
  </div>
);

function FeeBreakdown({ api }: { api: LaunchFormApi }) {
  const fee = api.form.creatorFeeBps;
  return (
    <Card title={T.feeTitle}>
      <div className="p-4">
        <div className="font-display text-5xl font-bold tabular-nums tracking-tight text-white">{bpsToPct(P.PROTOCOL_FEE_BPS + fee)}</div>
        <div className="mt-3 flex h-2 overflow-hidden bg-line">
          <div className="bg-primary" style={{ width: barPct(burnBps) }} />
          <div className="hatch" style={{ width: barPct(treasuryBps) }} />
          <div className="bg-muted" style={{ width: barPct(fee) }} />
        </div>
        <div className="mt-3 space-y-0.5">
          <Row label={<Swatch cls="bg-primary">{T.burn}</Swatch>} value={bpsToPct(burnBps)} />
          <Row label={<Swatch cls="hatch">{T.treasury}</Swatch>} value={bpsToPct(treasuryBps)} />
          <Row label={<Swatch cls="bg-muted">{T.creator} ({api.destinationLabel || "—"})</Swatch>} value={bpsToPct(fee)} />
        </div>
        <p className="mt-2 text-xs text-muted">{fill(T.feeExample, { fee: (1 + fee / 100).toFixed(2), creator: (fee / 100).toFixed(2) })}</p>
      </div>
    </Card>
  );
}

function LaunchProtection() {
  const vars = { startPct: LC.sniperTax.startBps / 100, decay: LC.sniperTax.decaySeconds, maxPct: LC.maxWallet.bps / 100 };
  return (
    <Card title={T.protectionTitle}>
      <ul className="space-y-3 p-4">
        {content.launch.protection.map((p) => (
          <li key={p.title} className="flex gap-3">
            <IconShield className="mt-0.5 shrink-0 text-white" width={16} height={16} />
            <div>
              <div className="text-sm font-medium text-white">{p.title}</div>
              <div className="text-xs text-muted">{fill(p.body, vars)}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function LaunchSidebar({ api }: { api: LaunchFormApi }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <TokenPreview api={api} />
      <FeeBreakdown api={api} />
      <LaunchProtection />
    </aside>
  );
}
