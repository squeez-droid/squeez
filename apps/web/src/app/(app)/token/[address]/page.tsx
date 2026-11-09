"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIndexedToken, isIndexerConfigured, type IndexedToken } from "@/lib/indexer";
import { bpsToPct, shortAddr } from "@/lib/format";
import { Badge, Button, Empty, Row, Spinner } from "@/components/ui";

export default function TokenPage({ params }: { params: { address: string } }) {
  const [token, setToken] = useState<IndexedToken | null>(null);
  const [loading, setLoading] = useState(isIndexerConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isIndexerConfigured) return;
    const controller = new AbortController();
    getIndexedToken(params.address, controller.signal)
      .then(setToken)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Indexer request failed.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params.address]);

  if (!isIndexerConfigured) return <Empty title="Indexer not configured" body="Configure this network’s indexer before opening token pages." />;
  if (loading) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> Loading indexed token…</div>;
  if (error) return <Empty title="Indexer unavailable" body={error} />;
  if (!token) return <Empty title="Token not found" body="No indexed TokenLaunched event matches this address." action={<Link href="/explore"><Button>Back to Explore</Button></Link>} />;

  return (
    <div>
      <Link href="/explore" className="text-sm text-muted hover:text-white">← Explore</Link>
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold uppercase text-white">{token.name ?? "Metadata pending"}</h1>
            {token.symbol && <span className="num text-muted">${token.symbol}</span>}
            <Badge tone={token.status === "graduated" ? "mint" : "primary"}>{token.status === "graduated" ? "Graduated" : "Bonding curve"}</Badge>
          </div>
          <p className="num mt-2 text-xs text-muted">{token.address}</p>
        </div>
        <div className="text-right text-xs text-muted">Indexed at block <span className="num text-white">{token.launchBlockNumber}</span></div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-medium text-white">Market activity</h2>
          <p className="mt-2 text-sm text-muted">Trades, candles, holders, and prices will appear only after their on-chain events and indexer handlers are implemented.</p>
        </div>
        <aside className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-medium text-white">On-chain launch data</h2>
          <div className="mt-3 divide-y divide-line text-sm">
            <Row label="Curve" value={shortAddr(token.curve, 6)} />
            <Row label="Creator" value={shortAddr(token.creator, 6)} />
            <Row label="Fee recipient" value={shortAddr(token.feeRecipient, 6)} />
            <Row label="Creator fee" value={bpsToPct(token.creatorFeeBps)} />
            <Row label="Launch config" value={`#${token.launchConfigId}`} />
            <Row label="Quote" value={token.quote === "0x0000000000000000000000000000000000000000" ? "HYPE" : shortAddr(token.quote, 6)} />
            <Row label="Pool" value={token.pool ? shortAddr(token.pool, 6) : "Not graduated"} />
          </div>
        </aside>
      </div>
    </div>
  );
}
