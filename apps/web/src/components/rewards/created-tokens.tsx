"use client";
import Link from "next/link";
import { content } from "@/lib/data";
import { bpsToPct, feeDestinationLabel, fmtNum } from "@/lib/format";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { claimKey, type RewardsApi } from "./use-rewards";

const T = content.rewards.created;

export function CreatedTokensCard({ api }: { api: RewardsApi }) {
  const action = <Link href="/launch"><Button size="sm" variant="secondary">{T.newLaunch}</Button></Link>;

  if (api.created.length === 0) {
    return (
      <Card title={T.title} action={action}>
        <div className="p-5">
          <Empty title={T.emptyTitle} body={api.isDemo ? T.emptyDemo : T.emptyLive} action={<Link href="/launch"><Button>{T.launch}</Button></Link>} />
        </div>
      </Card>
    );
  }

  return (
    <Card title={T.title} action={action}>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted">
            <tr className="text-left">
              {T.columns.map((c, i) => <th key={c} className={i === 0 ? "px-4 py-2 font-normal" : "font-normal"}>{c}</th>)}
              <th className="pr-4" />
            </tr>
          </thead>
          <tbody>
            {api.created.map(({ token: t, claimableHype, lifetimeHype }) => {
              const key = claimKey.creator(t);
              const c = api.claimable(key, claimableHype);
              return (
                <tr key={t.address} className="border-t border-line/60">
                  <td className="px-4 py-3">
                    <Link href={`/token/${t.address}`} className="flex items-center gap-2 hover:text-white hover:underline">
                      <span>
                        <span className="block font-medium text-white">{t.name ?? "Metadata pending"}</span>
                        <span className="flex items-center gap-1 text-xs text-muted">${t.symbol ?? "TOKEN"} · {t.quote === "0x0000000000000000000000000000000000000000" ? "HYPE" : "ERC-20"}</span>
                      </span>
                    </Link>
                  </td>
                  <td>{t.status === "graduated" ? <Badge tone="mint">Graduated</Badge> : <Badge tone="primary">Curve</Badge>}</td>
                  <td className="num text-white">{bpsToPct(t.creatorFeeBps)}</td>
                  <td className="text-xs text-muted">{feeDestinationLabel({
                    type: t.feeDestinationKind === 0 ? "direct" : "buyback",
                    buybackBps: t.buybackBps,
                  })}</td>
                  <td className="num text-white">{fmtNum(lifetimeHype, 2)}</td>
                  <td className="num text-white">{fmtNum(c, 4)} <span className="text-xs text-muted">HYPE</span></td>
                  <td className="pr-4 text-right">
                    <Button size="sm" disabled={c <= 0} onClick={() => api.claim(key, c, `$${t.symbol ?? "TOKEN"}`)}>{content.rewards.claim}</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
