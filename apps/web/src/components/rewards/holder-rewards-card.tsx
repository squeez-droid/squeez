"use client";
import { content } from "@/lib/data";
import { fill, fmtNum } from "@/lib/format";
import { Button, Card } from "@/components/ui";
import { TokenAvatar } from "@/components/token-bits";
import { claimKey, type RewardsApi } from "./use-rewards";

const T = content.rewards.holders;

export function HolderRewardsCard({ api }: { api: RewardsApi }) {
  return (
    <Card title={T.title}>
      <div className="p-4">
        {api.holderRewards.length === 0 && <p className="text-sm text-muted">{T.empty}</p>}
        {api.holderRewards.map((r) => {
          const key = claimKey.holder(r.token);
          const c = api.claimable(key, r.claimableHype);
          return (
            <div key={key} className="flex items-center gap-3 rounded-lg border border-line bg-bg p-3">
              <TokenAvatar token={r.token} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-white">${r.token.ticker}</div>
                <div className="text-xs text-muted">{fill(T.meta, { weight: r.weight, claimed: fmtNum(r.claimedHype, 2) })}</div>
              </div>
              <div className="num text-right text-sm text-white">{fmtNum(c, 4)}<div className="text-[11px] text-muted">HYPE</div></div>
              <Button size="sm" disabled={c <= 0} onClick={() => api.claim(key, c, `holder reward $${r.token.ticker}`)}>{content.rewards.claim}</Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
