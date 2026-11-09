"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { content } from "@/lib/data";
import { getDataSourceStatus, isIndexerConfigured, listIndexedTokens, type DataSourceStatus, type IndexedToken } from "@/lib/indexer";
import { bpsToPct, shortAddr } from "@/lib/format";
import { Badge, Button, Empty, Spinner } from "@/components/ui";
import { DataSourceState } from "@/components/data-source-state";

type StatusFilter = "all" | "curve" | "graduating" | "graduated";

export default function ExplorePage() {
  const [tokens, setTokens] = useState<IndexedToken[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(isIndexerConfigured);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<DataSourceStatus | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isIndexerConfigured) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([listIndexedTokens(controller.signal), getDataSourceStatus(controller.signal)])
      .then(([nextTokens, nextStatus]) => { setTokens(nextTokens); setSourceStatus(nextStatus); })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Indexer request failed.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const filtered = useMemo(() => tokens.filter((token) => {
    if (status !== "all" && token.status !== status) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${token.name ?? ""} ${token.symbol ?? ""} ${token.address}`.toLowerCase().includes(needle);
  }), [tokens, status, query]);

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-white md:text-4xl">{content.explore.title}</h1>
          <p className="mt-1 text-sm text-muted">Launches indexed from verified on-chain events.</p>
        </div>
        <Link href="/launch"><Button>Launch token</Button></Link>
      </div>

      <div className="my-5 flex flex-wrap gap-2">
        {(["all", "curve", "graduating", "graduated"] as const).map((value) => (
          <button key={value} onClick={() => setStatus(value)} className={`rounded-md border px-3 py-2 text-sm ${status === value ? "border-white bg-white text-bg" : "border-line text-muted hover:text-white"}`}>
            {value === "all" ? "All" : value === "curve" ? "Bonding curve" : "Graduated"}
          </button>
        ))}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, symbol, or address" className="ml-auto h-10 min-w-64 rounded-md border border-line bg-bg px-3 text-sm text-white outline-none placeholder:text-muted focus:border-white" />
      </div>

      <DataSourceState status={sourceStatus} />

      {!isIndexerConfigured ? (
        <Empty title="Indexer not configured" body="Set the network-specific Supabase URL, anon key, and schema to load indexed on-chain launches." />
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> Loading indexed launches…</div>
      ) : error ? (
        <Empty title="Indexer unavailable" body={error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>} />
      ) : filtered.length === 0 ? (
        <Empty title="No indexed launches" body="No on-chain TokenLaunched event matches the current filter." />
      ) : (
        <div className="grid gap-px border border-line bg-line md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((token) => (
            <Link key={token.address} href={`/token/${token.address}`} className="bg-bg p-5 hover:bg-surface">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold uppercase text-white">{token.name ?? "Metadata pending"}</h2>
                  <p className="num text-xs text-muted">{token.symbol ? `$${token.symbol}` : shortAddr(token.address, 6)}</p>
                </div>
                <Badge tone={token.status === "graduated" ? "mint" : "primary"}>{token.status === "graduated" ? "Graduated" : token.status === "graduating" ? "Graduating" : "Curve"}</Badge>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-muted">Creator fee</dt><dd className="num mt-1 text-white">{bpsToPct(token.creatorFeeBps)}</dd></div>
                <div><dt className="text-muted">Config</dt><dd className="num mt-1 text-white">#{token.launchConfigId}</dd></div>
                <div><dt className="text-muted">Creator</dt><dd className="num mt-1 text-white">{shortAddr(token.creator)}</dd></div>
                <div><dt className="text-muted">Block</dt><dd className="num mt-1 text-white">{token.launchBlockNumber}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
