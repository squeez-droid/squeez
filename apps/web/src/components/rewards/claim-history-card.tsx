import { content, NOW } from "@/lib/data";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { fmtNum, shortAddr, timeAgo } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import type { RewardsApi } from "./use-rewards";

const T = content.rewards.history;
export function ClaimHistoryCard({ api }: { api: RewardsApi }) {
  const selected = useSelectedTarget();
  const explorer = selected.chain.blockExplorers?.default.url ?? "";
  return (
    <Card title={T.title}>
      {api.history.length === 0 ? (
        <p className="p-4 text-sm text-muted">{T.empty}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {api.history.map((h) => {
            const isCreator = h.kind === "creator";
            return (
              <li key={h.txHash} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-white">${h.symbol}</span>
                <Badge tone={isCreator ? "primary" : "mint"}>{isCreator ? T.creator : T.holder}</Badge>
                <span className="num ml-auto text-white">{fmtNum(h.amountHype, 4)} HYPE</span>
                <span className="w-12 text-right text-xs text-muted">{timeAgo(h.timestamp, NOW)}</span>
                <a href={`${explorer}/tx/${h.txHash}`} target="_blank" rel="noreferrer" className="num text-xs text-muted hover:text-white hover:underline">
                  {shortAddr(h.txHash)} ↗
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
