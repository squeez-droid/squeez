import { content } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import { HYPE_USD } from "@/lib/market";
import { Stat } from "@/components/ui";
import type { RewardsApi } from "./use-rewards";

const T = content.rewards.stats;
const cell = "bg-surface px-4 py-3";

export function RewardStats({ api }: { api: RewardsApi }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
      <Stat className={cell} label={T.claimable} value={`${fmtNum(api.totalClaimable, 4)} HYPE`} sub={`$${fmtNum(api.totalClaimable * HYPE_USD, 2)}`} />
      <Stat className={cell} label={T.claimed} value={`${fmtNum(api.totalClaimed, 2)} HYPE`} />
      <Stat className={cell} label={T.lifetime} value={`${fmtNum(api.totalLifetime, 2)} HYPE`} sub={`$${fmtNum(api.totalLifetime * HYPE_USD, 0)}`} />
      <Stat className={cell} label={T.launched} value={String(api.created.length)} />
    </div>
  );
}
