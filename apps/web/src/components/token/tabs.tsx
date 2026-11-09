"use client";
import { useState } from "react";
import clsx from "clsx";
import { config, getCreatorFees, getHolders, NOW } from "@/lib/data";
import { fmtCompact, fmtNum, fmtPrice, shortAddr, timeAgo } from "@/lib/format";
import { HYPE_USD } from "@/lib/market";
import type { Token, Trade } from "@/lib/types";
import { Badge, Segmented } from "../ui";

type Tab = "trades" | "holders" | "fees";

export function TokenTabs({ token, trades, me }: { token: Token; trades: Trade[]; me: string | null }) {
  const [tab, setTab] = useState<Tab>("trades");
  const [mine, setMine] = useState(false);
  const holders = getHolders(token.address);
  const fees = getCreatorFees(token.address);
  const list = mine && me ? trades.filter((t) => t.trader.toLowerCase() === me.toLowerCase()) : trades;

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <Segmented size="sm" value={tab} onChange={setTab} options={[{ id: "trades", label: "Trades" }, { id: "holders", label: `Holders (${fmtNum(token.holdersCount, 0)})` }, { id: "fees", label: "Creator fees" }]} />
        {tab === "trades" && me && (
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-white" />My trades</label>
        )}
      </div>
      <div className="scrollbar-thin max-h-[420px] overflow-auto">
        {tab === "trades" && (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr className="text-left"><th className="px-4 py-2 font-normal">Time</th><th className="font-normal">Side</th><th className="font-normal">HYPE</th><th className="font-normal">{token.ticker}</th><th className="font-normal">Price</th><th className="font-normal">Trader</th><th className="pr-4 text-right font-normal">Tx</th></tr>
            </thead>
            <tbody className="num">
              {list.map((t) => (
                <tr key={t.txHash} className="border-t border-line/60 hover:bg-bg/50">
                  <td className="px-4 py-2 text-muted">{timeAgo(t.timestamp, NOW)}</td>
                  <td><span className={clsx("font-medium capitalize", t.side === "buy" ? "text-up" : "text-down")}>{t.side}</span>{t.venue === "uniswap-v4" && <Badge tone="muted" className="ml-1.5">v4</Badge>}</td>
                  <td className="text-white">{fmtNum(t.hypeAmount, 3)}</td>
                  <td className="text-white">{fmtCompact(t.tokenAmount)}</td>
                  <td className="text-muted">{fmtPrice(t.priceHype)}</td>
                  <td className={clsx(me && t.trader.toLowerCase() === me.toLowerCase() ? "text-white underline underline-offset-2" : "text-white/70")}>{t.trader === token.creator ? "dev · " : ""}{shortAddr(t.trader)}</td>
                  <td className="pr-4 text-right"><a className="text-muted hover:text-white" href={`${config.chain.explorer}/tx/${t.txHash}`} target="_blank" rel="noreferrer">↗</a></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No trades yet.</td></tr>}
            </tbody>
          </table>
        )}
        {tab === "holders" && (
          <ul className="divide-y divide-line/60">
            {holders.map((h, i) => (
              <li key={h.address + i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="num w-6 text-muted">{i + 1}</span>
                <span className="num text-white/90">{shortAddr(h.address)}</span>
                {h.label && <Badge tone={h.tag === "pool" || h.tag === "locker" ? "mint" : h.tag === "curve" ? "primary" : "default"}>{h.label}</Badge>}
                <div className="ml-auto flex w-40 items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden bg-line"><div className="h-full bg-white/80" style={{ width: `${Math.min(100, h.pct)}%` }} /></div>
                  <span className="num w-14 text-right text-white">{h.pct.toFixed(2)}%</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === "fees" && (
          <table className="w-full min-w-[480px] text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr className="text-left"><th className="px-4 py-2 font-normal">Time</th><th className="font-normal">Event</th><th className="font-normal">Source</th><th className="font-normal">HYPE</th><th className="pr-4 text-right font-normal">USD</th></tr>
            </thead>
            <tbody className="num">
              {fees.map((f) => (
                <tr key={f.txHash} className="border-t border-line/60">
                  <td className="px-4 py-2 text-muted">{timeAgo(f.timestamp, NOW)}</td>
                  <td>{f.type === "accrued" ? <Badge tone="primary">CreatorFeeAccrued</Badge> : <Badge tone="mint">CreatorFeeClaimed</Badge>}</td>
                  <td className="text-muted">{f.source === "hook" ? "v4 hook" : "curve"}</td>
                  <td className="text-white">{fmtNum(f.amountHype, 4)}</td>
                  <td className="pr-4 text-right text-muted">${fmtNum(f.amountHype * HYPE_USD, 2)}</td>
                </tr>
              ))}
              {token.creatorFeeBps === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">This token’s creator fee is 0%.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
