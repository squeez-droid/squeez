"use client";
import { useState } from "react";
import { config, getQuote } from "@/lib/data";
import { THRESHOLD, tokensSoldAt } from "@/lib/curve";
import { bpsToPct, fmtCompact, fmtNum, shortAddr } from "@/lib/format";
import { HYPE_USD } from "@/lib/market";
import type { Token } from "@/lib/types";
import { useWallet } from "@/providers/wallet";
import { useTx } from "@/providers/tx";
import { Badge, Button, Card, CopyButton, Modal, Progress, Row, inputCls } from "../ui";
import type { LiveState } from "./trade-panel";
import { IconCrown, IconLock } from "../icons";

export function CurveCard({ token, live }: { token: Token; live: LiveState }) {
  const pct = Math.min(100, (live.hypeRaised / THRESHOLD) * 100);
  const sold = tokensSoldAt(live.hypeRaised);
  return (
    <Card title="Bonding curve" action={<Badge tone={pct >= 80 ? "warn" : "primary"}>{pct >= 80 ? "Near graduation" : "Live"}</Badge>}>
      <div className="p-4">
        <div className="flex items-end justify-between">
          <span className="num text-2xl font-semibold text-white">{pct.toFixed(1)}%</span>
          <span className="num text-sm text-muted">{fmtNum(live.hypeRaised, 2)} / {THRESHOLD} HYPE</span>
        </div>
        <Progress value={pct} glow={pct >= 80} className="mt-2 h-2" />
        <div className="mt-3 space-y-0.5">
          <Row label="Left to graduation" value={`${fmtNum(Math.max(0, THRESHOLD - live.hypeRaised), 2)} HYPE`} />
          <Row label="Sold on curve" value={`${fmtCompact(sold)} / ${fmtCompact(config.launchConfig.totalSupply * config.launchConfig.curveSupplyFraction)}`} />
          <Row label="Quote at graduation" value={token.quote} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          At {THRESHOLD} HYPE raised the curve locks{token.quote !== "HYPE" && `, HYPE is swapped to ${token.quote}`} and a Uniswap v4 pool is created. LP + 4/49 of supply are locked forever.
        </p>
      </div>
    </Card>
  );
}

export function GraduatedCard({ token, justGraduated }: { token: Token; justGraduated: boolean }) {
  const q = getQuote(token.quote);
  return (
    <Card title="Graduated" action={<Badge tone="mint"><IconLock width={11} height={11} /> LP locked</Badge>}>
      <div className="p-4">
        {justGraduated && <p className="mb-3 rounded-md border border-white px-3 py-2 text-xs text-white">Graduated event detected. Trading now runs through the Uniswap v4 pool.</p>}
        <Progress value={100} className="h-2" />
        <div className="mt-3 space-y-0.5">
          <Row label="Pool" value={<span className="inline-flex items-center gap-1">{shortAddr(token.poolAddress ?? "0x9001000000000000000000000000000000000000")}<CopyButton text={token.poolAddress ?? ""} /></span>} />
          <Row label="LP token" value={`${fmtCompact(token.lpLocked?.tokenAmount ?? 204081633)} ${token.ticker}`} />
          <Row label="LP quote" value={token.lpLocked?.quoteAmount ? `${fmtNum(token.lpLocked.quoteAmount, 2)} ${q.symbol}` : `≈ ${fmtNum((THRESHOLD * 0.99 * HYPE_USD) / q.usd, 4)} ${q.symbol}`} />
          <Row label="Locked supply" value={`${fmtCompact(token.lockedSupply ?? 81632653)} ${token.ticker}`} />
          <Row label="Locker" value={shortAddr(config.contracts.SqueezLiquidityLocker)} />
          <Row label="Hook fee" value={`1% + ${bpsToPct(token.creatorFeeBps)}`} />
        </div>
      </div>
    </Card>
  );
}

export function CreatorCard({ token, onRecipientChange }: { token: Token; onRecipientChange: (a: string) => void }) {
  const w = useWallet();
  const tx = useTx();
  const claimableFromChain = 0;
  const lifetimeFromChain = 0;
  const [claimed, setClaimed] = useState(false);
  const [edit, setEdit] = useState(false);
  const [addr, setAddr] = useState(token.feeRecipient);
  const isCreator = !!w.address && w.address.toLowerCase() === token.creator.toLowerCase();
  if (!isCreator) return null;
  const claimable = claimed ? 0 : claimableFromChain;
  const dest = token.feeDestination;
  return (
    <Card title="Creator rewards" action={<Badge tone="primary"><IconCrown width={11} height={11} /> You are the creator</Badge>}>
      <div className="p-4">
        {dest.type === "holders" ? (
          <p className="text-sm text-muted">This token’s creator fees go to holders. There is nothing for the creator to claim.</p>
        ) : (
          <>
            <div className="text-xs text-muted">Claimable</div>
            <div className="num text-2xl font-semibold text-white">{fmtNum(claimable, 4)} HYPE</div>
            <div className="num text-xs text-muted">USD unavailable · lifetime {fmtNum(lifetimeFromChain, 2)} HYPE</div>
            <Button className="mt-3 w-full" disabled={claimable <= 0 || w.status !== "connected"} onClick={() => tx.run({ title: `Claim creator fee $${token.ticker}`, lines: [{ label: "Amount", value: `${fmtNum(claimable, 4)} HYPE` }, { label: "From", value: "SqueezFeeVault" }], successTitle: "Creator fee claimed", onSuccess: () => setClaimed(true) })}>
              {claimable > 0 ? "Claim" : "Nothing to claim"}
            </Button>
          </>
        )}
        <div className="mt-4 border-t border-line pt-3">
          <Row label="Fee wallet" value={<span className="inline-flex items-center gap-2">{shortAddr(token.feeRecipient)}<button className="text-xs text-white underline underline-offset-2" onClick={() => setEdit(true)}>Change</button></span>} />
        </div>
      </div>
      <Modal open={edit} onClose={() => setEdit(false)} title="Change fee wallet">
        <p className="text-sm text-muted">Only feeRecipient can change. Creator fee, fee destination and pair stay locked.</p>
        <input className={`${inputCls} num mt-3`} value={addr} onChange={(e) => setAddr(e.target.value.trim())} />
        <Button className="mt-4 w-full" disabled={!/^0x[a-fA-F0-9]{40}$/.test(addr) || addr === token.feeRecipient} onClick={() => { setEdit(false); tx.run({ title: "Update feeRecipient", lines: [{ label: "New", value: shortAddr(addr, 6) }], successTitle: "Fee wallet updated", onSuccess: () => onRecipientChange(addr) }); }}>Save</Button>
      </Modal>
    </Card>
  );
}

export function InfoCard({ token }: { token: Token }) {
  const d = token.feeDestination;
  const destText = d.type === "wallet" ? "Fee wallet" : d.type === "holders" ? "Holders (permanent)" : `Buyback & vest ${d.buybackBps / 100}% + Fee wallet ${100 - d.buybackBps / 100}%`;
  const lc = config.launchConfig;
  return (
    <Card title="Token info">
      <div className="space-y-0.5 p-4">
        <Row label="Contract" value={<span className="inline-flex items-center gap-1">{shortAddr(token.address)}<CopyButton text={token.address} /></span>} />
        <Row label="Curve" value={shortAddr(token.curveAddress)} />
        <Row label="Creator" value={shortAddr(token.creator)} />
        <Row label="Supply" value="1,000,000,000" />
        <Row label="Creator fee" value={bpsToPct(token.creatorFeeBps)} />
        <Row label="Fee destination" value={destText} />
        <Row label="LaunchConfig" value={`#${token.launchConfigId}`} />
        <Row label="Sniper tax" value={`${lc.sniperTax.startBps / 100}% → 0% / ${lc.sniperTax.decaySeconds}s`} />
        <Row label="Early max wallet" value={`${lc.maxWallet.bps / 100}%`} />
      </div>
    </Card>
  );
}
