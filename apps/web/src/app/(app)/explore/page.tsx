"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { content } from "@/lib/data";
import { getDataSourceStatus, getIndexedStats, isIndexerConfigured, listActiveQuotes, listIndexedTokens, type ActiveQuote, type DataSourceStatus, type IndexedStats, type IndexedToken } from "@/lib/indexer";
import { getProtocolConfig, type RuntimeProtocolConfig } from "@/lib/protocol-config";
import { bpsToPct, fmtNum, shortAddr } from "@/lib/format";
import { AnimatedProgressValue, Badge, Button, Empty, Progress, Spinner, Stat } from "@/components/ui";
import { DataSourceState } from "@/components/data-source-state";
import { IdentityBadges } from "@/components/identity-badges";
import { formatEther } from "viem";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { IndexedTokenArtwork, NetworkTokenAvatar } from "@/components/token-bits";

type StatusFilter = "all" | "curve" | "graduating" | "graduated";
type SortMode = "trending" | "new" | "graduating" | "graduated";
type PairFilter = "all" | "crypto" | "stock" | "stable";
const PAGE_SIZE = 12;

export default function ExplorePage() {
  const selected = useSelectedTarget();
  const nativeSymbol = selected.info.nativeCurrency.symbol;
  const [tokens, setTokens] = useState<IndexedToken[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("trending");
  const [pair, setPair] = useState<PairFilter>("all");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(isIndexerConfigured);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<DataSourceStatus | null>(null);
  const [protocol, setProtocol] = useState<RuntimeProtocolConfig | null>(null);
  const [stats, setStats] = useState<IndexedStats | null>(null);
  const [quotes, setQuotes] = useState<ActiveQuote[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isIndexerConfigured) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([listIndexedTokens(controller.signal, selected.targetApiUrl), getDataSourceStatus(controller.signal, selected.targetApiUrl), getProtocolConfig(controller.signal, selected.targetApiUrl), getIndexedStats(controller.signal, selected.targetApiUrl), listActiveQuotes(controller.signal, selected.targetApiUrl).catch(() => [])])
      .then(([nextTokens, nextStatus, nextProtocol, nextStats, nextQuotes]) => { setTokens(nextTokens); setSourceStatus(nextStatus); setProtocol(nextProtocol); setStats(nextStats); setQuotes(nextQuotes); })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Indexer request failed.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, selected.targetApiUrl]);

  const threshold = Number(protocol?.launchConfig.graduationThresholdHype ?? 0);
  const progressOf = useCallback((token: IndexedToken) => {
    if (token.status === "graduated") return 100;
    const raised = Number(formatEther(BigInt(token.hypeRaised ?? "0")));
    return threshold > 0 ? Math.min(100, (raised / threshold) * 100) : 0;
  }, [threshold]);
  const filtered = useMemo(() => tokens.filter((token) => {
    if (status !== "all" && token.status !== status) return false;
    const category = quotes.find((quote) => quote.asset.toLowerCase() === token.quote.toLowerCase())?.category
      ?? (token.quote.toLowerCase() === "0x0000000000000000000000000000000000000000" ? "crypto" : "unclassified");
    if (pair !== "all" && category !== pair) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${token.name ?? ""} ${token.symbol ?? ""} ${token.address}`.toLowerCase().includes(needle);
  }).sort((a, b) => {
    if (sort === "new") return Number(BigInt(b.createdAt) - BigInt(a.createdAt));
    if (sort === "graduating") return progressOf(b) - progressOf(a);
    if (sort === "graduated") return Number(b.status === "graduated") - Number(a.status === "graduated") || Number(BigInt(b.createdAt) - BigInt(a.createdAt));
    return Number(BigInt(b.volume24hHype ?? "0") - BigInt(a.volume24hHype ?? "0"));
  }), [tokens, status, pair, query, sort, progressOf, quotes]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [status, pair, query, sort]);

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-white md:text-4xl">{content.explore.title}</h1>
          <p className="mt-1 text-sm text-muted">Launches indexed from verified on-chain events.</p>
        </div>
        <Link href="/launch"><Button>Launch token</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-px border-x border-b border-line bg-line md:grid-cols-4">
        <Stat className="bg-bg p-4" label="Volume · 24h" value={stats ? `${fmtNum(Number(formatEther(BigInt(stats.volume24hHype))), 4)} ${nativeSymbol}` : "—"} sub={stats ? `${stats.trades24h} trades` : undefined} />
        <Stat className="bg-bg p-4" label="Creator fees · 24h" value={stats ? `${fmtNum(Number(formatEther(BigInt(stats.creatorFees24hHype))), 4)} ${nativeSymbol}` : "—"} />
        <Stat className="bg-bg p-4" label="$SQUEEZ burned" value={stats ? fmtNum(Number(formatEther(BigInt(stats.squeezBurned))), 2) : "—"} sub="Indexed burn events" />
        <Stat className="bg-bg p-4" label="Tokens launched" value={stats?.tokensLaunched ?? "—"} sub={stats ? `${stats.tokensGraduated} graduated` : undefined} />
      </div>

      <div className="my-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["trending", "new", "graduating", "graduated"] as const).map((value) => (
            <button key={value} onClick={() => setSort(value)} className={`rounded-md border px-3 py-2 text-sm capitalize ${sort === value ? "border-white bg-white text-bg" : "border-line text-muted hover:text-white"}`}>{value === "graduating" ? "About to graduate" : value}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
        {(["all", "curve", "graduating", "graduated"] as const).map((value) => (
          <button key={value} onClick={() => setStatus(value)} className={`rounded-md border px-3 py-2 text-sm ${status === value ? "border-white bg-white text-bg" : "border-line text-muted hover:text-white"}`}>
            {value === "all" ? "All" : value === "curve" ? "Bonding curve" : "Graduated"}
          </button>
        ))}
        {(["all", "crypto", "stock", "stable"] as const).map((value) => (
          <button key={`pair-${value}`} disabled={value !== "all" && !quotes.some((quote) => quote.category === value)} title={value !== "all" && !quotes.some((quote) => quote.category === value) ? "Available after the quote asset is verified and enabled on-chain" : undefined} onClick={() => setPair(value)} className={`rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${pair === value ? "border-primary text-primary" : "border-line text-muted hover:text-white"}`}>{value === "all" ? "All pairs" : value === "stable" ? "USDC" : value === "stock" ? "Stocks" : "Crypto"}</button>
        ))}
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, symbol, or address" className="ml-auto h-10 min-w-64 rounded-md border border-line bg-bg px-3 text-sm text-white outline-none placeholder:text-muted focus:border-white" />
        </div>
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
          {visible.map((token) => {
            const raised = Number(formatEther(BigInt(token.hypeRaised ?? "0")));
            const threshold = Number(protocol?.launchConfig.graduationThresholdHype ?? 0);
            const progress = token.status === "graduated" ? 100 : threshold > 0 ? Math.min(100, (raised / threshold) * 100) : 0;
            return (
            <Link key={token.address} href={`/token/${token.address}`} className="group relative isolate overflow-hidden bg-bg p-5 transition-colors hover:bg-surface">
              <IndexedTokenArtwork
                token={token}
                targetApiUrl={selected.targetApiUrl}
                className="pointer-events-none -z-20 opacity-25 grayscale transition duration-700 group-hover:scale-[1.03] group-hover:opacity-40 group-hover:grayscale-0"
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-bg/95 via-bg/80 to-bg/55 transition-colors group-hover:from-surface/95 group-hover:via-surface/80" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-bg to-transparent group-hover:from-surface" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3 pr-6">
                  <NetworkTokenAvatar token={token} targetApiUrl={selected.targetApiUrl} chain={selected.target.chain} stage={selected.target.stage} size={44} className="border border-white/15 shadow-lg" />
                  <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold uppercase text-white">{token.name ?? "Metadata pending"}</h2>
                  <p className="num text-xs text-muted">{token.symbol ? `$${token.symbol}` : shortAddr(token.address, 6)}</p>
                  </div>
                </div>
                <Badge tone={token.status === "graduated" ? "mint" : "primary"}>{token.status === "graduated" ? "Graduated" : token.status === "graduating" ? "Graduating" : "Curve"}</Badge>
              </div>
              <div className="mt-3"><IdentityBadges token={token} showOriginal /></div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-muted">Creator fee</dt><dd className="num mt-1 text-white">{bpsToPct(token.creatorFeeBps)}</dd></div>
                <div><dt className="text-muted">Config</dt><dd className="num mt-1 text-white">#{token.launchConfigId}</dd></div>
                <div><dt className="text-muted">Creator</dt><dd className="num mt-1 text-white">{shortAddr(token.creator)}</dd></div>
                <div><dt className="text-muted">Block</dt><dd className="num mt-1 text-white">{token.launchBlockNumber}</dd></div>
                <div><dt className="text-muted">Volume 24h</dt><dd className="num mt-1 text-white">{fmtNum(Number(formatEther(BigInt(token.volume24hHype ?? "0"))), 4)} {nativeSymbol}</dd></div>
                <div><dt className="text-muted">Trades</dt><dd className="num mt-1 text-white">{token.tradeCount ?? 0}</dd></div>
              </dl>
              <div className="mt-5 border-t border-line pt-4">
                <div className="num mb-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted">{token.status === "graduated" ? "Liquidity migrated" : "Bonding progress"}</span>
                  <AnimatedProgressValue value={progress} className="text-white" />
                </div>
                <Progress value={progress} glow={progress >= 80} />
                <div className="num mt-2 flex justify-between text-[10px] text-muted">
                  <span>{fmtNum(raised, 4)} {nativeSymbol} raised</span>
                  <span>{threshold > 0 ? `${fmtNum(threshold, 4)} ${nativeSymbol}` : "Threshold unavailable"}</span>
                </div>
              </div>
            </Link>
          );})}
        </div>
      )}
      {!loading && !error && filtered.length > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <span className="num text-muted">Page {page} / {pages} · {filtered.length} tokens</span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Next</Button>
        </div>
      )}
    </div>
  );
}
