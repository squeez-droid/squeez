"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
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
import { bpsToPct, shortAddr } from "@/lib/format";
import { Badge, Button, Empty, Progress, Row, Spinner } from "@/components/ui";
import { formatEther } from "viem";
import { OnchainTradePanel } from "@/components/token/onchain-trade-panel";
import { DataSourceState } from "@/components/data-source-state";
import { IdentityBadges } from "@/components/identity-badges";
import { PriceChart, type Timeframe } from "@/components/price-chart";
import { getProtocolConfig, type RuntimeProtocolConfig } from "@/lib/protocol-config";
import type { Candle } from "@/lib/types";
import { apiUrl } from "@/lib/chain";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { useRewards } from "@/components/rewards/use-rewards";

function TokenImage({ src }: { src: string }) {
  // Images are immutable, API-proxied IPFS assets; preserving their source size avoids a second image service.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />;
}

export default function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const selected = useSelectedTarget();
  const [token, setToken] = useState<IndexedToken | null>(null);
  const [trades, setTrades] = useState<IndexedTrade[]>([]);
  const [fees, setFees] = useState<IndexedCreatorFee[]>([]);
  const [loading, setLoading] = useState(isIndexerConfigured);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<DataSourceStatus | null>(null);
  const [protocol, setProtocol] = useState<RuntimeProtocolConfig | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [holders, setHolders] = useState<IndexedHolder[]>([]);
  const [holdersReady, setHoldersReady] = useState(false);
  const [metadata, setMetadata] = useState<IndexedMetadata | null>(null);
  const rewards = useRewards();

  const load = useCallback((signal?: AbortSignal) => {
    if (!isIndexerConfigured) return;
    Promise.all([
      getIndexedToken(address, signal, selected.targetApiUrl),
      listIndexedTrades(address, signal, selected.targetApiUrl),
      listIndexedCreatorFees(address, signal, selected.targetApiUrl),
      getDataSourceStatus(signal, selected.targetApiUrl),
      getProtocolConfig(signal, selected.targetApiUrl),
      listIndexedHolders(address, signal, selected.targetApiUrl).then((rows) => ({ rows, ready: true })).catch(() => ({ rows: [], ready: false })),
      getIndexedMetadata(address, signal, selected.targetApiUrl).catch(() => null),
    ])
      .then(([indexedToken, indexedTrades, indexedFees, nextStatus, nextProtocol, indexedHolders, indexedMetadata]) => {
        setToken(indexedToken);
        setTrades(indexedTrades);
        setFees(indexedFees);
        setSourceStatus(nextStatus);
        setProtocol(nextProtocol);
        setHolders(indexedHolders.rows);
        setHoldersReady(indexedHolders.ready);
        setMetadata(indexedMetadata);
      })
      .catch((cause) => {
        if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Indexer request failed.");
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
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
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!isIndexerConfigured) return <Empty title="Indexer not configured" body="Configure this network’s indexer before opening token pages." />;
  if (loading) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> Loading indexed token…</div>;
  if (error) return <Empty title="Indexer unavailable" body={error} action={<Button onClick={() => { setLoading(true); setError(null); load(); }}>Retry</Button>} />;
  if (!token) return <Empty title="Token not found" body="No indexed TokenLaunched event matches this address." action={<Link href="/explore"><Button>Back to Explore</Button></Link>} />;

  const raised = Number(formatEther(BigInt(token.hypeRaised ?? "0")));
  const threshold = Number(protocol?.launchConfig.graduationThresholdHype ?? 0);
  const bondingProgress = token.status === "graduated" ? 100 : threshold > 0 ? Math.min(100, (raised / threshold) * 100) : 0;
  const latestTrade = trades[0];
  const lastPrice = latestTrade && BigInt(latestTrade.tokenAmount) > 0n
    ? Number(formatEther(BigInt(latestTrade.hypeAmount))) / Number(formatEther(BigInt(latestTrade.tokenAmount))) : null;
  const volumeHype = trades.reduce((sum, trade) => sum + Number(formatEther(BigInt(trade.hypeAmount))), 0);
  const creatorReward = rewards.created.find((item) => item.token.address.toLowerCase() === token.address.toLowerCase());
  const explorer = protocol?.chain.explorer?.replace(/\/$/, "");

  return (
    <div>
      <Link href="/explore" className="text-sm text-muted hover:text-white">← Explore</Link>
      <div className="mt-4"><DataSourceState status={sourceStatus} /></div>
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          {metadata?.imagePath && <TokenImage src={`${apiUrl}${metadata.imagePath}`} />}
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold uppercase text-white">{token.name ?? "Metadata pending"}</h1>
            {token.symbol && <span className="num text-muted">${token.symbol}</span>}
            <Badge tone={token.status === "graduated" ? "mint" : "primary"}>{token.status === "graduated" ? "Graduated" : token.status === "graduating" ? "Graduation pending" : "Bonding curve"}</Badge>
            <IdentityBadges token={token} showOriginal />
          </div>
          <p className="num mt-2 text-xs text-muted">{token.address}</p>
          {metadata?.description && <p className="mt-3 max-w-2xl text-sm text-muted">{metadata.description}</p>}
          {metadata?.links && <div className="mt-2 flex flex-wrap gap-3 text-xs text-primary">
            {metadata.links.website && <a href={metadata.links.website} target="_blank" rel="noreferrer">Website ↗</a>}
            {metadata.links.x && <a href={metadata.links.x} target="_blank" rel="noreferrer">X ↗</a>}
            {metadata.links.telegram && <a href={metadata.links.telegram} target="_blank" rel="noreferrer">Telegram ↗</a>}
          </div>}
          </div>
        </div>
        <div className="text-right text-xs text-muted">Indexed at block <span className="num text-white">{token.launchBlockNumber}</span></div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
            <div className="bg-surface p-4"><div className="text-xs text-muted">Last price</div><div className="num mt-1 text-white">{lastPrice === null ? "—" : `${lastPrice.toPrecision(5)} HYPE`}</div></div>
            <div className="bg-surface p-4"><div className="text-xs text-muted">Indexed volume</div><div className="num mt-1 text-white">{volumeHype.toFixed(6)} HYPE</div></div>
            <div className="bg-surface p-4"><div className="text-xs text-muted">Trades</div><div className="num mt-1 text-white">{trades.length}</div></div>
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
            <h2 className="font-medium text-white">Token holders</h2>
            {!holdersReady ? (
              <p className="mt-2 text-sm text-muted">Holder indexing will become available after the token Transfer-event backfill completes.</p>
            ) : holders.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No positive token balances are currently indexed.</p>
            ) : (
              <div className="mt-3 divide-y divide-line text-sm">
                {holders.slice(0, 25).map((holder, index) => {
                  const balance = Number(formatEther(BigInt(holder.balance)));
                  return <div key={holder.account} className="grid grid-cols-[32px_1fr_auto_auto] gap-3 py-2">
                    <span className="num text-muted">{index + 1}</span>
                    <span className="num text-white">{shortAddr(holder.account, 6)}{holder.account.toLowerCase() === token.curve.toLowerCase() ? " · Curve" : ""}</span>
                    <span className="num text-muted">{balance.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                    <span className="num text-muted">{(balance / 1_000_000_000 * 100).toFixed(3)}%</span>
                  </div>;
                })}
              </div>
            )}
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-end justify-between gap-4">
              <div><h2 className="font-medium text-white">Bonding progress</h2><p className="mt-1 text-xs text-muted">HYPE held by the curve toward automatic graduation.</p></div>
              <strong className="num text-2xl text-white">{bondingProgress.toFixed(1)}%</strong>
            </div>
            <Progress value={bondingProgress} glow={bondingProgress >= 80} className="mt-4 h-2" />
            <div className="num mt-2 flex justify-between text-xs text-muted"><span>{raised.toFixed(6)} HYPE raised</span><span>{threshold > 0 ? `${threshold} HYPE target` : "Threshold unavailable"}</span></div>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-medium text-white">Indexed on-chain trades</h2>
            {trades.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No on-chain trades have been indexed for this token.</p>
            ) : (
              <div className="mt-3 divide-y divide-line text-sm">
                {trades.slice(0, 20).map((trade) => (
                  <div key={trade.id} className="grid grid-cols-[70px_1fr_1fr] gap-3 py-2">
                    <span className={trade.isBuy ? "text-primary" : "text-red-300"}>{trade.isBuy ? "Buy" : "Sell"}</span>
                    <span className="num text-white">{Number(formatEther(BigInt(trade.hypeAmount))).toFixed(6)} HYPE</span>
                    <span className="num text-right text-muted">{shortAddr(trade.trader, 5)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-medium text-white">Creator fee events</h2>
            {fees.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No creator-fee event has been indexed.</p>
            ) : (
              <div className="mt-3 divide-y divide-line text-sm">
                {fees.slice(0, 20).map((fee) => (
                  <div key={fee.id} className="flex items-center justify-between gap-3 py-2">
                    <span className={fee.kind === "accrued" ? "text-primary" : "text-mint"}>{fee.kind}</span>
                    <span className="num text-white">
                      {fee.asset === "0x0000000000000000000000000000000000000000"
                        ? `${Number(formatEther(BigInt(fee.amount))).toFixed(6)} HYPE`
                        : `${fee.amount} units · ${shortAddr(fee.asset, 4)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          {token.status !== "graduating" && <OnchainTradePanel token={token} onConfirmed={() => load()} />}
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-medium text-white">Creator rewards</h2>
            {!creatorReward ? (
              <p className="mt-2 text-sm text-muted">Connect the configured fee-recipient wallet to view and claim creator fees.</p>
            ) : (
              <>
                <div className="mt-3 divide-y divide-line text-sm"><Row label="Claimable" value={`${creatorReward.claimableHype.toFixed(6)} HYPE`} /><Row label="Lifetime accrued" value={`${creatorReward.lifetimeHype.toFixed(6)} HYPE`} /></div>
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
              <Row label="Quote" value={token.quote === "0x0000000000000000000000000000000000000000" ? "HYPE" : shortAddr(token.quote, 6)} />
              <Row label="Pool" value={token.pool ? shortAddr(token.pool, 6) : "Not graduated"} />
              <Row label="Active venue" value={token.venue === "uniswap-v4" ? "Uniswap v4 pool" : "Bonding curve"} />
              <Row label="HYPE raised" value={`${raised.toFixed(6)} HYPE`} />
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
