"use client";
import { BURN_BPS_OF_PROTOCOL, PROTOCOL_FEE_BPS } from "@squeez/shared";
import { content } from "@/lib/data";
import { bpsToPct, fill } from "@/lib/format";
import { Card, Row, Swatch } from "@/components/ui";
import { PairBadge, TokenAvatar } from "@/components/token-bits";
import { IconShield } from "@/components/icons";
import type { LaunchFormApi } from "./use-launch-form";
import { ChainBadge } from "@/components/chain-logo";
import { useSelectedTarget } from "@/lib/use-selected-target";

const T = content.launch.preview;
const burnBps = (PROTOCOL_FEE_BPS * BURN_BPS_OF_PROTOCOL) / 10000;
const treasuryBps = PROTOCOL_FEE_BPS - burnBps;
/** Bar widths are scaled against the 11% maximum (1% protocol + 10% creator). */
const barPct = (bps: number) => `${bps / 11}%`;

function TokenPreview({ api }: { api: LaunchFormApi }) {
  const f = api.form;
  const selected = useSelectedTarget();
  return (
    <Card title={T.title}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex shrink-0">
            {f.image ? <TokenAvatar token={{ image: f.image, ticker: f.ticker }} size={52} /> : <div className="h-[52px] w-[52px] rounded-md border border-dashed border-line" />}
            <ChainBadge chain={selected.target.chain} stage={selected.target.stage} size={18} />
          </span>
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
          <MiniStat label={T.startMcap} value="On-chain" />
          <MiniStat label={T.gradMcap} value={`${api.protocol.data?.launchConfig.graduationThresholdHype ?? "—"} ${api.nativeSymbol}`} />
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
        <div className="font-display text-5xl font-bold tabular-nums tracking-tight text-white">{bpsToPct(PROTOCOL_FEE_BPS + fee)}</div>
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

function LaunchProtection({ api }: { api: LaunchFormApi }) {
  const lc = api.protocol.data?.launchConfig;
  const vars = { startPct: Number(lc?.sniperTaxStartBps ?? 0) / 100, decay: lc?.sniperTaxDecaySeconds ?? "—", maxPct: Number(lc?.maxWalletBps ?? 0) / 100 };
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
      <LaunchProtection api={api} />
    </aside>
  );
}
