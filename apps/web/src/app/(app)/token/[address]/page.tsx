"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getIndexedToken,
  getDataSourceStatus,
  isIndexerConfigured,
  listIndexedCreatorFees,
  listIndexedTrades,
  type IndexedCreatorFee,
  type DataSourceStatus,
  type IndexedToken,
  type IndexedTrade,
} from "@/lib/indexer";
import { bpsToPct, shortAddr } from "@/lib/format";
import { Badge, Button, Empty, Row, Spinner } from "@/components/ui";
import { formatEther } from "viem";
import { OnchainTradePanel } from "@/components/token/onchain-trade-panel";
import { DataSourceState } from "@/components/data-source-state";

export default function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [token, setToken] = useState<IndexedToken | null>(null);
  const [trades, setTrades] = useState<IndexedTrade[]>([]);
  const [fees, setFees] = useState<IndexedCreatorFee[]>([]);
  const [loading, setLoading] = useState(isIndexerConfigured);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<DataSourceStatus | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    if (!isIndexerConfigured) return;
    Promise.all([
      getIndexedToken(address, signal),
      listIndexedTrades(address, signal),
      listIndexedCreatorFees(address, signal),
      getDataSourceStatus(signal),
    ])
      .then(([indexedToken, indexedTrades, indexedFees, nextStatus]) => {
        setToken(indexedToken);
        setTrades(indexedTrades);
        setFees(indexedFees);
        setSourceStatus(nextStatus);
      })
      .catch((cause) => {
        if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Indexer request failed.");
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [address]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!isIndexerConfigured) return <Empty title="Indexer not configured" body="Configure this network’s indexer before opening token pages." />;
  if (loading) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> Loading indexed token…</div>;
  if (error) return <Empty title="Indexer unavailable" body={error} action={<Button onClick={() => { setLoading(true); setError(null); load(); }}>Retry</Button>} />;
  if (!token) return <Empty title="Token not found" body="No indexed TokenLaunched event matches this address." action={<Link href="/explore"><Button>Back to Explore</Button></Link>} />;

  return (
    <div>
      <Link href="/explore" className="text-sm text-muted hover:text-white">← Explore</Link>
      <div className="mt-4"><DataSourceState status={sourceStatus} /></div>
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold uppercase text-white">{token.name ?? "Metadata pending"}</h1>
            {token.symbol && <span className="num text-muted">${token.symbol}</span>}
            <Badge tone={token.status === "graduated" ? "mint" : "primary"}>{token.status === "graduated" ? "Graduated" : token.status === "graduating" ? "Graduation pending" : "Bonding curve"}</Badge>
          </div>
          <p className="num mt-2 text-xs text-muted">{token.address}</p>
        </div>
        <div className="text-right text-xs text-muted">Indexed at block <span className="num text-white">{token.launchBlockNumber}</span></div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
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
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
