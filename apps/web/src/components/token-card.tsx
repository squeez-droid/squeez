"use client";

import Link from "next/link";
import clsx from "clsx";
import { tokenMarket } from "@/lib/market";
import { NOW } from "@/lib/data";
import { bpsToPct, fmtNum, fmtPct, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { THRESHOLD } from "@/lib/curve";
import type { Token } from "@/lib/types";
import { Badge, Progress } from "./ui";
import { PairBadge, TokenAvatar } from "./token-bits";
import { useSelectedTarget } from "@/lib/use-selected-target";

export function TokenCard({ token }: { token: Token }) {
  const nativeSymbol = useSelectedTarget().info.nativeCurrency.symbol;
  const m = tokenMarket(token);
  const grad = token.status === "graduated";
  return (
    <Link href={`/token/${token.address}`} className="group flex min-w-0 flex-col bg-bg p-4 transition-colors hover:bg-surface">
      <div className="flex items-start gap-3">
        <TokenAvatar token={token} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-white group-hover:underline group-hover:underline-offset-4">{token.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span className="num text-white/80">${token.ticker}</span>
            <PairBadge quote={token.quote} />
            {grad && <Badge tone="mint">Grad</Badge>}
          </div>
        </div>
        <span className={clsx("num text-sm", token.change24h >= 0 ? "text-up" : "text-down")}>{fmtPct(token.change24h)}</span>
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted">{token.description}</p>
      <dl className="num mt-3 grid grid-cols-2 gap-x-4 text-xs">
        <div className="flex justify-between"><dt className="text-muted">MCap</dt><dd className="text-white">{fmtUsd(m.mcapUsd)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Vol</dt><dd className="text-white">{fmtUsd(token.volume24hUsd)}</dd></div>
      </dl>
      <div className="mt-4">
        <div className="num mb-1.5 flex justify-between text-[11px]">
          <span className="text-muted">{grad ? "v4 pool" : "curve"}</span>
          <span className="text-white/80">{grad ? "LP locked" : `${fmtNum(token.hypeRaised, 1)} / ${THRESHOLD} ${nativeSymbol}`}</span>
        </div>
        <Progress value={m.progress} glow={grad || m.progress >= 80} />
      </div>
      <div className="num mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>fee {bpsToPct(token.creatorFeeBps)} · {shortAddr(token.creator)}</span>
        <span>{timeAgo(token.createdAt, NOW)}</span>
      </div>
    </Link>
  );
}
export function TokenRow({ token, rank }: { token: Token; rank: number }) {
  const m = tokenMarket(token);
  const grad = token.status === "graduated";
  return (
    <tr className="group border-t border-line">
      <td className="num w-10 py-3 pl-4 text-xs text-muted">{String(rank).padStart(2, "0")}</td>
      <td className="py-3">
        <Link href={`/token/${token.address}`} className="flex items-center gap-3">
          <TokenAvatar token={token} size={32} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-white group-hover:underline group-hover:underline-offset-4">{token.name}</span>
            <span className="num block text-xs text-muted">${token.ticker}</span>
          </span>
        </Link>
      </td>
      <td><PairBadge quote={token.quote} /></td>
      <td className="num text-right text-white">{fmtUsd(m.mcapUsd)}</td>
      <td className="num text-right text-white">{fmtUsd(token.volume24hUsd)}</td>
      <td className={clsx("num text-right", token.change24h >= 0 ? "text-up" : "text-down")}>{fmtPct(token.change24h)}</td>
      <td className="num text-right text-muted">{bpsToPct(token.creatorFeeBps)}</td>
      <td className="w-44 pl-6 pr-4">
        <div className="num mb-1 flex justify-between text-[11px] text-muted"><span>{grad ? "v4" : "curve"}</span><span>{m.progress.toFixed(0)}%</span></div>
        <Progress value={m.progress} glow={grad || m.progress >= 80} />
      </td>
    </tr>
  );
}
