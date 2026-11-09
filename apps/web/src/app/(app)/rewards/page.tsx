"use client";
import { content } from "@/lib/data";
import { fill, fmtNum } from "@/lib/format";
import { useWallet } from "@/providers/wallet";
import { Button, PageHeader, Spinner } from "@/components/ui";
import {
  ClaimHistoryCard, ConnectPrompt, CreatedTokensCard, HolderRewardsCard, RewardStats, VestingCard, useRewards,
} from "@/components/rewards";

export default function RewardsPage() {
  const w = useWallet();
  const api = useRewards();
  if (w.status !== "connected") return <ConnectPrompt />;
  if (api.loading) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Spinner /> Loading on-chain creator rewards…</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={content.rewards.title}
        intro={content.rewards.intro}
        action={
          <Button size="lg" disabled={api.totalClaimable <= 0} onClick={api.claimAll}>
            {fill(content.rewards.claimAll, { amount: fmtNum(api.totalClaimable, 4) })}
          </Button>
        }
      />
      <RewardStats api={api} />
      {api.error && <div className="rounded-lg border border-down/30 bg-down/10 p-3 text-sm text-down">{api.error} <button className="ml-2 underline" onClick={() => void api.reload()}>Retry</button></div>}
      <CreatedTokensCard api={api} />
      <div className="grid gap-4 lg:grid-cols-2">
        <VestingCard api={api} />
        <HolderRewardsCard api={api} />
      </div>
      <ClaimHistoryCard api={api} />
    </div>
  );
}
