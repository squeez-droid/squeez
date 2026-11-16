"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getIndexedToken,
  getIndexedMetadata,
  getDataSourceStatus,
  isIndexerConfigured,
  listIndexedCreatorFees,
  listIndexedHolders,
  listIndexedTrades,
  type IndexedCreatorFee,
  type IndexedHolder,
  type IndexedMetadata,
  type DataSourceStatus,
  type IndexedToken,
  type IndexedTrade,
} from "@/lib/indexer";
import { bpsToPct, fmtPrice, fmtUsd, shortAddr } from "@/lib/format";
import { AnimatedProgressValue, Badge, Button, CopyButton, Empty, Progress, Row, Spinner } from "@/components/ui";
import { formatEther } from "viem";
import { OnchainTradePanel } from "@/components/token/onchain-trade-panel";
import { DataSourceState } from "@/components/data-source-state";
import { IdentityBadges } from "@/components/identity-badges";
import { PriceChart, type Timeframe } from "@/components/price-chart";
import { getProtocolConfig, type RuntimeProtocolConfig } from "@/lib/protocol-config";
import type { Candle } from "@/lib/types";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { useRewards } from "@/components/rewards/use-rewards";
import { IconTelegram, IconWebsite, IconX } from "@/components/icons";
import { ChainBadge } from "@/components/chain-logo";
import { apiAssetUrl } from "@/lib/api-asset-url";
import { indexedMarketCapNative } from "@/lib/indexed-market";
import { nativeUsd, useNativeUsdPrices } from "@/lib/native-usd";

function TokenImage({ src }: { src: string }) {
  // Images are immutable, API-proxied IPFS assets; preserving their source size avoids a second image service.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />;
}

function socialLabel(kind: "website" | "x" | "telegram", value: string): string {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./i, "");
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (kind === "website") return hostname;
    const username = path.split("/").filter(Boolean).at(-1);
    if (username) return `@${username.replace(/^@/, "")}`;
    return hostname;
  } catch {
    return kind === "website" ? value : `@${value.replace(/^@/, "")}`;
  }
}

export default function TokenPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = use(params);
  const address = slug.at(-1) ?? "";
  const selected = useSelectedTarget();
  const nativeSymbol = selected.info.nativeCurrency.symbol;
  const [token, setToken] = useState<IndexedToken | null>(null);
  const [trades, setTrades] = useState<IndexedTrade[]>([]);
  const [fees, setFees] = useState<IndexedCreatorFee[]>([]);
  const [loading, setLoading] = useState(isIndexerConfigured);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<DataSourceStatus | null>(null);
  const [protocol, setProtocol] = useState<RuntimeProtocolConfig | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [activityTab, setActivityTab] = useState<"trades" | "holders" | "fees">("trades");
  const [holders, setHolders] = useState<IndexedHolder[]>([]);
  const [holdersReady, setHoldersReady] = useState(false);
  const [metadata, setMetadata] = useState<IndexedMetadata | null>(null);
  const rewards = useRewards();
  const usdPrices = useNativeUsdPrices();
  const refreshInFlight = useRef(false);

  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    if (!isIndexerConfigured || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const [indexedToken, indexedTrades, indexedFees, nextStatus, nextProtocol, indexedHolders, indexedMetadata] = await Promise.all([
      getIndexedToken(address, signal, selected.targetApiUrl),
      listIndexedTrades(address, signal, selected.targetApiUrl),
      listIndexedCreatorFees(address, signal, selected.targetApiUrl),
      getDataSourceStatus(signal, selected.targetApiUrl),
      getProtocolConfig(signal, selected.targetApiUrl),
      listIndexedHolders(address, signal, selected.targetApiUrl).then((rows) => ({ rows, ready: true })).catch(() => ({ rows: [], ready: false })),
      getIndexedMetadata(address, signal, selected.targetApiUrl).catch(() => null),
      ]);
      if (signal?.aborted) return;
      setToken(indexedToken);
      setTrades(indexedTrades);
      setFees(indexedFees);
      setSourceStatus(nextStatus);
      setProtocol(nextProtocol);
      setHolders(indexedHolders.rows);
      setHoldersReady(indexedHolders.ready);
      setMetadata(indexedMetadata);
      setError(null);
    } catch (cause) {
      if (!signal?.aborted && !background) setError(cause instanceof Error ? cause.message : "Indexer request failed.");
    } finally {
      refreshInFlight.current = false;
      if (!signal?.aborted) setLoading(false);
    }
  }, [address, selected.targetApiUrl]);

  const candles = useMemo<Candle[]>(() => trades
    .map((trade) => {
      const hype = Number(formatEther(BigInt(trade.hypeAmount)));
      const amount = Number(formatEther(BigInt(trade.tokenAmount)));
      const price = amount > 0 ? hype / amount : 0;
      return { time: Number(trade.timestamp), open: price, high: price, low: price, close: price, volumeHype: hype };
    })
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => a.time - b.time), [trades]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(controller.signal, true);
    };
    const interval = window.setInterval(refresh, 5_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  if (!isIndexerConfigured) return <Empty title="Indexer not configured" body="Configure this network’s indexer before opening token pages." />;
  if (loading) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> Loading indexed token…</div>;
  if (error) return <Empty title="Indexer unavailable" body={error} action={<Button onClick={() => { setLoading(true); setError(null); load(); }}>Retry</Button>} />;
  if (!token) return <Empty title="Token not found" body="No indexed TokenLaunched event matches this address." action={<Link href="/explore"><Button>Back to Explore</Button></Link>} />;

  const raised = Number(formatEther(BigInt(token.hypeRaised ?? "0")));
  const threshold = token.graduationThresholdHypeWei
    ? Number(formatEther(BigInt(token.graduationThresholdHypeWei)))
    : Number(protocol?.launchConfig.graduationThresholdHype ?? 0);
  const bondingProgress = token.status === "graduated" ? 100 : threshold > 0 ? Math.min(100, (raised / threshold) * 100) : 0;
  const latestTrade = trades[0];
  const lastPrice = latestTrade && BigInt(latestTrade.tokenAmount) > 0n
    ? Number(formatEther(BigInt(latestTrade.hypeAmount))) / Number(formatEther(BigInt(latestTrade.tokenAmount))) : null;
  const marketCap = indexedMarketCapNative(token);
  const usdRate = nativeUsd(usdPrices.data, nativeSymbol);
  const priceUsd = lastPrice !== null && usdRate !== null ? lastPrice * usdRate : null;
  const volumeNative24h = Number(formatEther(BigInt(token.volume24hHype ?? "0")));
  const totalFeesNative = fees.filter((fee) => fee.kind === "accrued")
    .reduce((sum, fee) => sum + Number(formatEther(BigInt(fee.amount))), 0);
  const creatorReward = rewards.created.find((item) => item.token.address.toLowerCase() === token.address.toLowerCase());
  const explorer = protocol?.chain.explorer?.replace(/\/$/, "");
  const tokenImage = apiAssetUrl(metadata?.imagePath);

  return (
    <div>
      <Link href="/explore" className="text-sm text-muted hover:text-white">← Explore</Link>
      <div className="mt-4"><DataSourceState status={sourceStatus} /></div>
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          {tokenImage && (
            <span className="relative inline-flex shrink-0">
              <TokenImage src={tokenImage} />
              <ChainBadge chain={selected.target.chain} stage={selected.target.stage} size={20} />
            </span>
          )}
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold uppercase text-white">{token.name ?? "Metadata pending"}</h1>
            {token.symbol && <span className="num text-muted">${token.symbol}</span>}
            <Badge tone={token.status === "graduated" ? "mint" : "primary"}>{token.status === "graduated" ? "Graduated" : token.status === "graduating" ? "Graduation pending" : "Bonding curve"}</Badge>
            <IdentityBadges token={token} showOriginal />
          </div>
          <div className="mt-2 flex max-w-full items-center gap-2 text-xs text-muted">
            <span className="num shrink-0 uppercase">CA</span>
            <span className="num min-w-0 break-all text-white/80">{token.address}</span>
            <CopyButton text={token.address} className="shrink-0" />
          </div>
          {metadata?.description && <p className="mt-3 max-w-2xl text-sm text-muted">{metadata.description}</p>}
          {metadata?.links && <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {metadata.links.website && <a href={metadata.links.website} target="_blank" rel="noreferrer" aria-label={`Open ${socialLabel("website", metadata.links.website)}`} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-muted transition-colors hover:border-white/50 hover:text-white"><IconWebsite width={14} height={14} /><span>{socialLabel("website", metadata.links.website)}</span></a>}
            {metadata.links.x && <a href={metadata.links.x} target="_blank" rel="noreferrer" aria-label={`Open X account ${socialLabel("x", metadata.links.x)}`} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-muted transition-colors hover:border-white/50 hover:text-white"><IconX width={13} height={13} /><span>{socialLabel("x", metadata.links.x)}</span></a>}
            {metadata.links.telegram && <a href={metadata.links.telegram} target="_blank" rel="noreferrer" aria-label={`Open Telegram ${socialLabel("telegram", metadata.links.telegram)}`} className="inline-flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-muted transition-colors hover:border-white/50 hover:text-white"><IconTelegram width={14} height={14} /><span>{socialLabel("telegram", metadata.links.telegram)}</span></a>}
          </div>}
          </div>
        </div>
        <div className="text-right text-xs text-muted">Indexed at block <span className="num text-white">{token.launchBlockNumber}</span></div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-5">
            <div className="bg-surface p-4"><div className="text-xs text-muted">Price</div><div className="num mt-1 text-white">{priceUsd === null ? "—" : `$${fmtPrice(priceUsd)}`}</div></div>
            <div className="bg-surface p-4"><div className="text-xs text-muted">Market cap</div><div className="num mt-1 text-white">{marketCap === null ? "Awaiting trade" : usdRate === null ? "USD unavailable" : fmtUsd(marketCap * usdRate)}</div></div>
            <div className="bg-surface p-4"><div className="text-xs text-muted">24h volume</div><div className="num mt-1 text-white">{usdRate === null ? "—" : fmtUsd(volumeNative24h * usdRate)}</div></div>
            <div className="bg-surface p-4"><div className="text-xs text-muted">Total fees</div><div className="num mt-1 text-white">{usdRate === null ? "—" : fmtUsd(totalFeesNative * usdRate)}</div></div>
            <div className="bg-surface p-4"><div className="text-xs text-muted">Holders</div><div className="num mt-1 text-white">{holdersReady ? holders.length : "Indexing…"}</div></div>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium text-white">On-chain price chart</h2>
                <p className="mt-1 text-xs text-muted">Built only from indexed curve and pool swap events.</p>
              </div>
              <div className="flex gap-1">
                {(["5m", "15m", "1h"] as const).map((value) => (
                  <button key={value} onClick={() => setTimeframe(value)} className={`num rounded border px-2 py-1 text-xs ${timeframe === value ? "border-white text-white" : "border-line text-muted"}`}>{value}</button>
                ))}
              </div>
            </div>
            <div className="relative mt-4 min-h-[320px] border border-line/70 bg-bg/40">
              <PriceChart candles={candles} tf={timeframe} multiplier={1} height={320} />
              {candles.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-bg/20 text-center">
                  <p className="text-sm text-white">Waiting for the first on-chain trade</p>
                  <p className="mt-1 max-w-sm text-xs text-muted">The chart is ready and will populate automatically after a buy or sell is indexed.</p>
                </div>
              )}
            </div>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-end justify-between gap-4">
              <div><h2 className="font-medium text-white">Bonding progress</h2><p className="mt-1 text-xs text-muted">{nativeSymbol} held by the curve toward automatic graduation.</p></div>
              <strong className="num text-2xl text-white"><AnimatedProgressValue value={bondingProgress} /></strong>
            </div>
            <Progress value={bondingProgress} glow={bondingProgress >= 80} className="mt-4 h-2" />
            <div className="num mt-2 flex justify-between text-xs text-muted"><span>{raised.toFixed(6)} {nativeSymbol} raised</span><span>{threshold > 0 ? `${threshold} ${nativeSymbol} target` : "Threshold unavailable"}</span></div>
          </section>
          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex overflow-x-auto border-b border-line px-3 pt-3" role="tablist" aria-label="Token on-chain activity">
              {([
                ["trades", "Trades", trades.length],
                ["holders", "Holders", holdersReady ? holders.length : null],
                ["fees", "Creator fees", fees.length],
              ] as const).map(([value, label, count]) => (
                <button key={value} type="button" role="tab" aria-selected={activityTab === value} onClick={() => setActivityTab(value)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${activityTab === value ? "border-primary text-white" : "border-transparent text-muted hover:text-white"}`}>
                  {label}{count !== null && <span className="num ml-2 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px]">{count}</span>}
                </button>
              ))}
            </div>
            <div className="max-h-[380px] overflow-auto" role="tabpanel">
              {activityTab === "trades" && (trades.length === 0 ? (
                <p className="p-5 text-sm text-muted">No on-chain trades have been indexed for this token.</p>
              ) : (
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-surface text-xs text-muted"><tr><th className="px-5 py-3 font-normal">Side</th><th className="px-4 py-3 font-normal">Venue</th><th className="px-4 py-3 font-normal">Value</th><th className="px-4 py-3 font-normal">Tokens</th><th className="px-4 py-3 font-normal">Trader</th><th className="px-5 py-3 text-right font-normal">Transaction</th></tr></thead>
                  <tbody className="divide-y divide-line">{trades.map((trade) => <tr key={trade.id} className="hover:bg-white/[0.02]"><td className={`px-5 py-3 ${trade.isBuy ? "text-primary" : "text-red-300"}`}>{trade.isBuy ? "Buy" : "Sell"}</td><td className="px-4 py-3 text-muted">{trade.source === "pool" ? "Uniswap v4" : "Curve"}</td><td className="num px-4 py-3 text-white">{Number(formatEther(BigInt(trade.hypeAmount))).toFixed(6)} {nativeSymbol}</td><td className="num px-4 py-3 text-muted">{Number(formatEther(BigInt(trade.tokenAmount))).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td><td className="num px-4 py-3 text-muted">{shortAddr(trade.trader, 5)}</td><td className="px-5 py-3 text-right">{explorer ? <a href={`${explorer}/tx/${trade.txHash}`} target="_blank" rel="noreferrer" className="num text-primary hover:text-white">{shortAddr(trade.txHash, 5)}</a> : <span className="num text-muted">{shortAddr(trade.txHash, 5)}</span>}</td></tr>)}</tbody>
                </table>
              ))}
              {activityTab === "holders" && (!holdersReady ? (
                <p className="p-5 text-sm text-muted">Holder indexing will become available after the token Transfer-event backfill completes.</p>
              ) : holders.length === 0 ? (
                <p className="p-5 text-sm text-muted">No positive token balances are currently indexed.</p>
              ) : (
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-surface text-xs text-muted"><tr><th className="px-5 py-3 font-normal">#</th><th className="px-4 py-3 font-normal">Holder</th><th className="px-4 py-3 text-right font-normal">Balance</th><th className="px-5 py-3 text-right font-normal">Supply</th></tr></thead>
                  <tbody className="divide-y divide-line">{holders.map((holder, index) => { const balance = Number(formatEther(BigInt(holder.balance))); return <tr key={holder.account} className="hover:bg-white/[0.02]"><td className="num px-5 py-3 text-muted">{index + 1}</td><td className="num px-4 py-3 text-white">{shortAddr(holder.account, 7)}{holder.account.toLowerCase() === token.curve.toLowerCase() ? <span className="ml-2 text-xs text-muted">Curve</span> : null}</td><td className="num px-4 py-3 text-right text-muted">{balance.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td><td className="num px-5 py-3 text-right text-muted">{(balance / 1_000_000_000 * 100).toFixed(3)}%</td></tr>; })}</tbody>
                </table>
              ))}
              {activityTab === "fees" && (fees.length === 0 ? (
                <p className="p-5 text-sm text-muted">No creator-fee event has been indexed.</p>
              ) : (
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-surface text-xs text-muted"><tr><th className="px-5 py-3 font-normal">Event</th><th className="px-4 py-3 font-normal">Amount</th><th className="px-4 py-3 font-normal">Recipient / asset</th><th className="px-5 py-3 text-right font-normal">Transaction</th></tr></thead>
                  <tbody className="divide-y divide-line">{fees.map((fee) => <tr key={fee.id} className="hover:bg-white/[0.02]"><td className={`px-5 py-3 capitalize ${fee.kind === "accrued" ? "text-primary" : "text-mint"}`}>{fee.kind}</td><td className="num px-4 py-3 text-white">{fee.asset === "0x0000000000000000000000000000000000000000" ? `${Number(formatEther(BigInt(fee.amount))).toFixed(6)} ${nativeSymbol}` : `${fee.amount} units`}</td><td className="num px-4 py-3 text-muted">{shortAddr(fee.recipient ?? fee.asset, 5)}</td><td className="px-5 py-3 text-right">{explorer ? <a href={`${explorer}/tx/${fee.txHash}`} target="_blank" rel="noreferrer" className="num text-primary hover:text-white">{shortAddr(fee.txHash, 5)}</a> : <span className="num text-muted">{shortAddr(fee.txHash, 5)}</span>}</td></tr>)}</tbody>
                </table>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-5">
          <OnchainTradePanel token={token} onConfirmed={() => load()} />
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-medium text-white">Creator rewards</h2>
            {!creatorReward ? (
              <p className="mt-2 text-sm text-muted">Connect the configured fee-recipient wallet to view and claim creator fees.</p>
            ) : (
              <>
                <div className="mt-3 divide-y divide-line text-sm"><Row label="Claimable" value={`${creatorReward.claimableHype.toFixed(6)} ${nativeSymbol}`} /><Row label="Lifetime accrued" value={`${creatorReward.lifetimeHype.toFixed(6)} ${nativeSymbol}`} /></div>
                <Button className="mt-4 w-full" disabled={creatorReward.claimableHype <= 0} onClick={() => rewards.claim(token.address, creatorReward.claimableHype, `$${token.symbol ?? "TOKEN"}`)}>Claim creator fees</Button>
              </>
            )}
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-medium text-white">On-chain launch data</h2>
            <div className="mt-3 divide-y divide-line text-sm">
              <Row label="Curve" value={shortAddr(token.curve, 6)} />
              <Row label="Creator" value={shortAddr(token.creator, 6)} />
              <Row label="Fee recipient" value={shortAddr(token.feeRecipient, 6)} />
              <Row label="Creator fee" value={bpsToPct(token.creatorFeeBps)} />
              <Row label="Launch config" value={`#${token.launchConfigId}`} />
              <Row label="Quote" value={token.quote === "0x0000000000000000000000000000000000000000" ? nativeSymbol : shortAddr(token.quote, 6)} />
              <Row label="Pool" value={token.pool ? shortAddr(token.pool, 6) : "Not graduated"} />
              <Row label="Active venue" value={token.venue === "uniswap-v4" ? "Uniswap v4 pool" : "Bonding curve"} />
              <Row label={`${nativeSymbol} raised`} value={`${raised.toFixed(6)} ${nativeSymbol}`} />
              <Row label="Bonding progress" value={`${bondingProgress.toFixed(1)}%`} />
            </div>
            {explorer && <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4 text-xs text-primary">
              <a href={`${explorer}/address/${token.address}`} target="_blank" rel="noreferrer">Token ↗</a>
              <a href={`${explorer}/address/${token.curve}`} target="_blank" rel="noreferrer">Curve ↗</a>
              {token.pool && <a href={`${explorer}/address/${token.pool}`} target="_blank" rel="noreferrer">Pool ↗</a>}
              <a href={`${explorer}/tx/${token.launchTxHash}`} target="_blank" rel="noreferrer">Launch tx ↗</a>
            </div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
