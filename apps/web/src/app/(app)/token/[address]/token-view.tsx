"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { getCandles, getQuote, getTrades, NOW } from "@/lib/data";
import { SUPPLY, THRESHOLD, priceAt } from "@/lib/curve";
import { fmtNum, fmtPct, fmtPrice, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { HYPE_USD } from "@/lib/market";
import type { Token } from "@/lib/types";
import { useWallet } from "@/providers/wallet";
import { Badge, CopyButton, Segmented } from "@/components/ui";
import { PairBadge, TokenAvatar } from "@/components/token-bits";
import { PriceChart, type Timeframe } from "@/components/price-chart";
import { TradePanel, type LiveState } from "@/components/token/trade-panel";
import { TokenTabs } from "@/components/token/tabs";
import { CreatorCard, CurveCard, GraduatedCard, InfoCard } from "@/components/token/side-cards";

type Denom = "quote" | "usd" | "hype";

export function TokenView({ initial }: { initial: Token }) {
  const w = useWallet();
  const [token, setToken] = useState(initial);
  const quote = getQuote(token.quote);
  const holdingInit = 0;
  const raised = token.hypeRaised;
  const status = token.status;
  const justGraduated = false;
  const [tf, setTf] = useState<Timeframe>("5m");
  const [denom, setDenom] = useState<Denom>("quote");

  const priceHype = status === "graduated" ? token.priceHype ?? priceAt(THRESHOLD) : priceAt(raised);
  const live: LiveState = { status, hypeRaised: raised, priceHype, holding: w.address ? holdingInit : 0 };
  const priceUsd = priceHype * HYPE_USD;
  const priceQuote = priceUsd / quote.usd;
  const mult = denom === "quote" ? HYPE_USD / quote.usd : denom === "usd" ? HYPE_USD : 1;
  const candles = useMemo(() => getCandles(token.address), [token.address]);
  const trades = useMemo(() => getTrades(token.address), [token.address]);

  const onTrade = () => undefined;

  const socials = [token.socials.x && { l: "X", h: token.socials.x }, token.socials.telegram && { l: "Telegram", h: token.socials.telegram }, token.socials.website && { l: "Web", h: token.socials.website }].filter(Boolean) as { l: string; h: string }[];

  return (
    <div>
      <Link href="/" className="text-sm text-muted hover:text-white">← Explore</Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <TokenAvatar token={token} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-white">{token.name}</h1>
              <span className="text-muted">${token.ticker}</span>
              <PairBadge quote={token.quote} />
              {status === "graduated" ? <Badge tone="mint">Graduated · Uniswap v4</Badge> : <Badge tone="primary">Bonding curve</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>by <span className="num text-white/80">{shortAddr(token.creator)}</span></span>
              <span className="inline-flex items-center gap-1 num">{shortAddr(token.address)} <CopyButton text={token.address} /></span>
              <span>{timeAgo(token.createdAt, NOW)} ago</span>
              {socials.map((s) => <a key={s.l} href={s.h} target="_blank" rel="noreferrer" className="hover:text-white hover:underline">{s.l} ↗</a>)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div><div className="text-xs text-muted">Price ({quote.symbol})</div><div className="num font-semibold text-white">{fmtPrice(priceQuote)}</div><div className="num text-xs text-muted">${fmtPrice(priceUsd)}</div></div>
          <div><div className="text-xs text-muted">Market cap</div><div className="num font-semibold text-white">{fmtUsd(priceUsd * SUPPLY)}</div></div>
          <div><div className="text-xs text-muted">Vol 24h</div><div className="num font-semibold text-white">{fmtUsd(token.volume24hUsd)}</div></div>
          <div><div className="text-xs text-muted">24h</div><div className={clsx("num font-semibold", token.change24h >= 0 ? "text-up" : "text-down")}>{fmtPct(token.change24h)}</div></div>
        </div>
      </div>

      <p className="mt-3 max-w-3xl text-sm text-muted">{token.description}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Segmented size="sm" value={tf} onChange={setTf} options={[{ id: "5m", label: "5m" }, { id: "15m", label: "15m" }, { id: "1h", label: "1h" }]} />
              <Segmented size="sm" value={denom} onChange={setDenom} options={[{ id: "quote", label: quote.symbol }, { id: "usd", label: "USD" }, ...(quote.symbol !== "HYPE" ? [{ id: "hype" as Denom, label: "HYPE" }] : [])]} />
            </div>
            <PriceChart candles={candles} tf={tf} multiplier={mult} />
          </div>
          <TokenTabs token={token} trades={trades} me={w.address} />
        </div>
        <aside className="space-y-4">
          <TradePanel key={status} token={token} live={live} onTrade={onTrade} />
          {status === "graduated" ? <GraduatedCard token={token} justGraduated={justGraduated} /> : <CurveCard token={token} live={live} />}
          <CreatorCard token={token} onRecipientChange={(a) => setToken((t) => ({ ...t, feeRecipient: a }))} />
          {live.holding > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4 text-sm">
              <div className="text-xs text-muted">Your position</div>
              <div className="num mt-0.5 font-semibold text-white">{fmtNum(live.holding, 0)} {token.ticker}</div>
              <div className="num text-xs text-muted">≈ ${fmtNum(live.holding * priceUsd, 2)} · {((live.holding / SUPPLY) * 100).toFixed(3)}% supply</div>
            </div>
          )}
          <InfoCard token={token} />
        </aside>
      </div>
    </div>
  );
}
