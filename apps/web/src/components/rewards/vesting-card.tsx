"use client";
import { config, content, NOW } from "@/lib/data";
import { fill, fmtCompact } from "@/lib/format";
import { Button, Card, Progress } from "@/components/ui";
import { TokenAvatar } from "@/components/token-bits";
import { claimKey, type RewardsApi } from "./use-rewards";

const T = content.rewards.vesting;
const YEARS = config.launchConfig.buybackVest.vestYears;

const Mini = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-muted">{label}</div>
    <div className="num text-white">{value}</div>
  </div>
);

export function VestingCard({ api }: { api: RewardsApi }) {
  const vesting = api.created.filter((r) => r.vesting);
  return (
    <Card title={T.title}>
      <div className="space-y-4 p-4">
        {vesting.length === 0 && <p className="text-sm text-muted">{T.empty}</p>}
        {vesting.map(({ token, vesting: v }) => {
          if (!v) return null;
          const key = claimKey.vest(token);
          const done = api.claimed[key];
          const start = Date.parse(v.startAt);
          const pct = ((NOW - start) / (Date.parse(v.endAt) - start)) * 100;
          return (
            <div key={key} className="rounded-lg border border-line bg-bg p-3">
              <div className="flex items-center gap-2">
                <TokenAvatar token={token} size={24} />
                <span className="font-medium text-white">${token.ticker}</span>
                <span className="ml-auto text-xs text-muted">{fill(T.release, { years: YEARS })}</span>
              </div>
              <Progress value={pct} className="mt-3" />
              <div className="num mt-1 flex justify-between text-[11px] text-muted">
                <span>{v.startAt.slice(0, 10)}</span><span>{pct.toFixed(2)}%</span><span>{v.endAt.slice(0, 10)}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label={T.locked} value={fmtCompact(v.lockedTokens)} />
                <Mini label={T.released} value={fmtCompact(v.releasedTokens)} />
                <Mini label={T.claimable} value={fmtCompact(done ? 0 : v.claimableTokens)} />
              </div>
              <Button size="sm" variant="secondary" className="mt-3 w-full" disabled={done || v.claimableTokens <= 0} onClick={() => api.claimVest(token, v.claimableTokens, T.success)}>
                {T.claim}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
