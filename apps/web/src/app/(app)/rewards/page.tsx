"use client";
import { content } from "@/lib/data";
import { fill, fmtNum } from "@/lib/format";
import { useWallet } from "@/providers/wallet";
import { Button, PageHeader } from "@/components/ui";
import {
  ClaimHistoryCard, ConnectPrompt, CreatedTokensCard, HolderRewardsCard, RewardStats, VestingCard, useRewards,
} from "@/components/rewards";

export default function RewardsPage() {
  const w = useWallet();
  const api = useRewards();
  if (w.status !== "connected") return <ConnectPrompt />;

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
      <CreatedTokensCard api={api} />
      <div className="grid gap-4 lg:grid-cols-2">
        <VestingCard api={api} />
        <HolderRewardsCard api={api} />
      </div>
      <ClaimHistoryCard api={api} />
    </div>
  );
}
