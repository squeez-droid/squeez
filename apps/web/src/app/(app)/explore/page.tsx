"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { content } from "@/lib/data";
import { getGlobalExplore, type ExploreTarget, type GlobalIndexedToken } from "@/lib/indexer";
import { bpsToPct, fmtNum, fmtUsd, shortAddr } from "@/lib/format";
import { AnimatedProgressValue, Badge, Button, Empty, Progress, Spinner, Stat } from "@/components/ui";
import { IdentityBadges } from "@/components/identity-badges";
import { formatEther } from "viem";
import { IndexedTokenArtwork, NetworkTokenAvatar } from "@/components/token-bits";
import { CHAINS, type SqueezChain } from "@squeez/shared";
import { apiUrl } from "@/lib/chain";
import { ChainLogo, chainLabel } from "@/components/chain-logo";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { indexedMarketCapNative } from "@/lib/indexed-market";
import { nativeUsd, useNativeUsdPrices } from "@/lib/native-usd";

type StatusFilter = "all" | "curve" | "graduating" | "graduated";
type SortMode = "trending" | "new" | "graduating" | "graduated";
const PAGE_SIZE = 12;

export default function ExplorePage() {
  const stage = useSelectedTarget().target.stage;
  const usdPrices = useNativeUsdPrices();
  const [chainFilter, setChainFilter] = useState<SqueezChain | "all">("all");
  const [tokens, setTokens] = useState<GlobalIndexedToken[]>([]);
  const [targets, setTargets] = useState<ExploreTarget[]>([]);
  const [degraded, setDegraded] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<SqueezChain[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortMode>("trending");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chain = params.get("chain");
    setChainFilter(CHAINS.includes(chain as SqueezChain) ? chain as SqueezChain : "all");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getGlobalExplore(stage, chainFilter === "all" ? "all" : [chainFilter], controller.signal)
      .then((result) => {
        setTokens(result.tokens);
        setTargets(result.targets.healthy);
        setDegraded(result.targets.degraded.map((target) => target.id));
        setUnavailable(result.targets.unavailable);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Indexer request failed.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, stage, chainFilter]);

  const progressOf = useCallback((token: GlobalIndexedToken) => {
    if (token.status === "graduated") return 100;
    const raised = Number(formatEther(BigInt(token.hypeRaised ?? "0")));
    const threshold = token.graduationThresholdHypeWei
      ? Number(formatEther(BigInt(token.graduationThresholdHypeWei)))
      : Number(token.target.graduationThreshold ?? 0);
    return threshold > 0 ? Math.min(100, (raised / threshold) * 100) : 0;
  }, []);
  const filtered = useMemo(() => tokens.filter((token) => {
    if (status !== "all" && token.status !== status) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${token.name ?? ""} ${token.symbol ?? ""} ${token.address}`.toLowerCase().includes(needle);
  }).sort((a, b) => {
    if (sort === "new") return Number(BigInt(b.createdAt) - BigInt(a.createdAt));
    if (sort === "graduating") return progressOf(b) - progressOf(a);
    if (sort === "graduated") return Number(b.status === "graduated") - Number(a.status === "graduated") || Number(BigInt(b.createdAt) - BigInt(a.createdAt));
    return Number(BigInt(b.volume24hHype ?? "0") - BigInt(a.volume24hHype ?? "0"));
  }), [tokens, status, query, sort, progressOf]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [status, query, sort, stage, chainFilter]);

  const selectChain = (nextChain: SqueezChain | "all") => {
    setChainFilter(nextChain);
    const url = new URL(window.location.href);
    if (nextChain === "all") url.searchParams.delete("chain");
    else url.searchParams.set("chain", nextChain);
    window.history.replaceState(null, "", url.toString());
  };
  const totalLaunched = targets.reduce((sum, target) => sum + target.stats.tokensLaunched, 0);
  const totalGraduated = targets.reduce((sum, target) => sum + target.stats.tokensGraduated, 0);
  const totalTrades = targets.reduce((sum, target) => sum + target.stats.trades24h, 0);
  const totalVolumeUsd = targets.reduce((sum, target) => {
    const rate = nativeUsd(usdPrices.data, target.nativeSymbol);
    return rate === null ? sum : sum + Number(formatEther(BigInt(target.stats.volume24hHype))) * rate;
  }, 0);
  const targetApiUrl = (token: GlobalIndexedToken) => `${apiUrl}/v1/${token.target.chain}/${token.target.stage}`;

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-white md:text-4xl">{content.explore.title}</h1>
          <p className="mt-1 text-sm text-muted">All verified launches across Squeez networks, with chain-aware execution.</p>
        </div>
        <Link href="/launch"><Button>Launch token</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-px border-x border-b border-line bg-line md:grid-cols-4">
        <Stat className="bg-bg p-4" label="Live networks" value={loading ? "—" : targets.length} sub={`${stage} · ${degraded.length ? `${degraded.length} degraded` : "all healthy"}`} />
        <Stat className="bg-bg p-4" label="Tokens launched" value={loading ? "—" : totalLaunched} sub={`${totalGraduated} graduated`} />
        <Stat className="bg-bg p-4" label="Trades · 24h" value={loading ? "—" : totalTrades} sub="Across selected chains" />
        <Stat className="bg-bg p-4" label="Volume · 24h" value={usdPrices.data && targets.length ? fmtUsd(totalVolumeUsd) : "—"} sub="Live USD reference" />
      </div>

      <div className="my-5 flex flex-col gap-3 border border-line bg-surface/40 p-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0" aria-label="Filter by chain">
          <span className="num mr-1 shrink-0 text-[10px] uppercase tracking-wider text-muted">Chain</span>
          <button onClick={() => selectChain("all")} className={`shrink-0 rounded-md border px-3 py-2 text-xs ${chainFilter === "all" ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:text-white"}`}>All</button>
          {CHAINS.map((chain) => (
            <button key={chain} onClick={() => selectChain(chain)} className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs ${chainFilter === chain ? "border-primary bg-primary/10 text-primary" : "border-line text-muted hover:text-white"}`}>
              <ChainLogo chain={chain} size={16} />{chainLabel(chain)}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 xl:justify-end">
          <label className="sr-only" htmlFor="explore-status">Token status</label>
          <select id="explore-status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-9 rounded-md border border-line bg-bg px-3 text-xs text-white outline-none focus:border-white">
            <option value="all">All statuses</option>
            <option value="curve">Bonding curve</option>
            <option value="graduating">Graduating</option>
            <option value="graduated">Graduated</option>
          </select>
          <label className="sr-only" htmlFor="explore-sort">Sort tokens</label>
          <select id="explore-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-9 rounded-md border border-line bg-bg px-3 text-xs text-white outline-none focus:border-white">
            <option value="trending">Trending</option>
            <option value="new">Newest</option>
            <option value="graduating">About to graduate</option>
            <option value="graduated">Graduated first</option>
          </select>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ticker, address" aria-label="Search tokens" className="h-9 min-w-52 flex-1 rounded-md border border-line bg-bg px-3 text-xs text-white outline-none placeholder:text-muted focus:border-white xl:max-w-64" />
        </div>
      </div>

      {degraded.length > 0 && <div className="mb-4 border border-warn/50 bg-warn/10 px-3 py-2 text-xs text-warn">Some networks are temporarily unavailable: {degraded.join(", ")}. Healthy networks remain visible.</div>}
      {unavailable.length > 0 && <div className="mb-4 border border-line bg-surface px-3 py-2 text-xs text-muted">Not active for {stage}: {unavailable.map(chainLabel).join(", ")}. They will join this feed automatically when their deployment capability is enabled.</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> Loading indexed launches…</div>
      ) : error ? (
        <Empty title="Indexer unavailable" body={error} action={<Button onClick={() => setReload((value) => value + 1)}>Retry</Button>} />
      ) : filtered.length === 0 ? (
        <Empty title="No indexed launches" body="No on-chain TokenLaunched event matches the current filter." />
      ) : (
        <div className="grid gap-px border border-line bg-line md:grid-cols-2 xl:grid-cols-3">
          {visible.map((token) => {
            const raised = Number(formatEther(BigInt(token.hypeRaised ?? "0")));
            const threshold = token.graduationThresholdHypeWei
              ? Number(formatEther(BigInt(token.graduationThresholdHypeWei)))
              : Number(token.target.graduationThreshold ?? 0);
            const progress = token.status === "graduated" ? 100 : threshold > 0 ? Math.min(100, (raised / threshold) * 100) : 0;
            const marketCap = indexedMarketCapNative(token);
            const usdRate = nativeUsd(usdPrices.data, token.target.nativeSymbol);
            const apiBase = targetApiUrl(token);
            return (
            <Link key={`${token.target.chain}:${token.target.stage}:${token.address}`} href={`/token/${token.target.chain}/${token.target.stage}/${token.address}`} className="group relative isolate overflow-hidden bg-bg p-5 transition-colors hover:bg-surface">
              <IndexedTokenArtwork
                token={token}
                targetApiUrl={apiBase}
                className="pointer-events-none -z-20 opacity-25 grayscale transition duration-700 group-hover:scale-[1.03] group-hover:opacity-40 group-hover:grayscale-0"
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-bg/95 via-bg/80 to-bg/55 transition-colors group-hover:from-surface/95 group-hover:via-surface/80" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-bg to-transparent group-hover:from-surface" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3 pr-6">
                  <NetworkTokenAvatar token={token} targetApiUrl={apiBase} chain={token.target.chain} stage={token.target.stage} size={44} className="border border-white/15 shadow-lg" />
                  <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold uppercase text-white">{token.name ?? "Metadata pending"}</h2>
                  <p className="num text-xs text-muted">{token.symbol ? `$${token.symbol}` : shortAddr(token.address, 6)}</p>
                  </div>
                </div>
                <Badge tone={token.status === "graduated" ? "mint" : "primary"}>{token.status === "graduated" ? "Graduated" : token.status === "graduating" ? "Graduating" : "Curve"}</Badge>
              </div>
              <div className="mt-3"><IdentityBadges token={token} showOriginal /></div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-muted">Market cap</dt><dd className="num mt-1 text-white">{marketCap === null ? "Awaiting first trade" : usdRate === null ? "USD price unavailable" : fmtUsd(marketCap * usdRate)}</dd></div>
                <div><dt className="text-muted">Creator fee</dt><dd className="num mt-1 text-white">{bpsToPct(token.creatorFeeBps)}</dd></div>
                <div><dt className="text-muted">Config</dt><dd className="num mt-1 text-white">#{token.launchConfigId}</dd></div>
                <div><dt className="text-muted">Creator</dt><dd className="num mt-1 text-white">{shortAddr(token.creator)}</dd></div>
                <div><dt className="text-muted">Block</dt><dd className="num mt-1 text-white">{token.launchBlockNumber}</dd></div>
                <div><dt className="text-muted">Volume 24h</dt><dd className="num mt-1 text-white">{usdRate === null ? "USD price unavailable" : fmtUsd(Number(formatEther(BigInt(token.volume24hHype ?? "0"))) * usdRate)}</dd></div>
                <div><dt className="text-muted">Trades</dt><dd className="num mt-1 text-white">{token.tradeCount ?? 0}</dd></div>
              </dl>
              <div className="mt-5 border-t border-line pt-4">
                <div className="num mb-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted">{token.status === "graduated" ? "Liquidity migrated" : "Bonding progress"}</span>
                  <AnimatedProgressValue value={progress} className="text-white" />
                </div>
                <Progress value={progress} glow={progress >= 80} />
                <div className="num mt-2 flex justify-between text-[10px] text-muted">
                  <span>{fmtNum(raised, 4)} {token.target.nativeSymbol} raised</span>
                  <span>{threshold > 0 ? `${fmtNum(threshold, 4)} ${token.target.nativeSymbol}` : "Threshold unavailable"}</span>
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
