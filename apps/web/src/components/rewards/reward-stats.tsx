import { content } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import { HYPE_USD } from "@/lib/market";
import { Stat } from "@/components/ui";
import type { RewardsApi } from "./use-rewards";
import { useSelectedTarget } from "@/lib/use-selected-target";

const T = content.rewards.stats;
const cell = "bg-surface px-4 py-3";

export function RewardStats({ api }: { api: RewardsApi }) {
  const nativeSymbol = useSelectedTarget().info.nativeCurrency.symbol;
  const usd = nativeSymbol === "HYPE";
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-4">
      <Stat className={cell} label={T.claimable} value={`${fmtNum(api.totalClaimable, 4)} ${nativeSymbol}`} sub={usd ? `$${fmtNum(api.totalClaimable * HYPE_USD, 2)}` : undefined} />
      <Stat className={cell} label={T.claimed} value={`${fmtNum(api.totalClaimed, 2)} ${nativeSymbol}`} />
      <Stat className={cell} label={T.lifetime} value={`${fmtNum(api.totalLifetime, 2)} ${nativeSymbol}`} sub={usd ? `$${fmtNum(api.totalLifetime * HYPE_USD, 0)}` : undefined} />
      <Stat className={cell} label={T.launched} value={String(api.created.length)} />
    </div>
  );
}
