import { config, content, getToken, NOW } from "@/lib/data";
import { fmtNum, shortAddr, timeAgo } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { TokenAvatar } from "@/components/token-bits";
import type { RewardsApi } from "./use-rewards";

const T = content.rewards.history;

export function ClaimHistoryCard({ api }: { api: RewardsApi }) {
  return (
    <Card title={T.title}>
      {api.history.length === 0 ? (
        <p className="p-4 text-sm text-muted">{T.empty}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {api.history.map((h) => {
            const t = getToken(h.token);
            const isCreator = h.kind === "creator";
            return (
              <li key={h.txHash} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {t && <TokenAvatar token={t} size={24} />}
                <span className="text-white">${t?.ticker}</span>
                <Badge tone={isCreator ? "primary" : "mint"}>{isCreator ? T.creator : T.holder}</Badge>
                <span className="num ml-auto text-white">{fmtNum(h.amountHype, 4)} HYPE</span>
                <span className="w-12 text-right text-xs text-muted">{timeAgo(h.timestamp, NOW)}</span>
                <a href={`${config.chain.explorer}/tx/${h.txHash}`} target="_blank" rel="noreferrer" className="num text-xs text-muted hover:text-white hover:underline">
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
