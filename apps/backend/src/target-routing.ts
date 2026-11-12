import type { SqueezChain, Stage } from "@squeez/shared";

export interface ServedTarget {
  chain: SqueezChain;
  stage: Stage;
}

export type TargetRoute =
  | { kind: "canonical"; pathname: string }
  | { kind: "legacy"; pathname: string; successor: string }
  | { kind: "mismatch"; requestedTarget: string; servedTarget: string }
  | { kind: "unrelated"; pathname: string };

export function resolveTargetRoute(pathname: string, served: ServedTarget): TargetRoute {
  const match = pathname.match(/^\/v1\/(elysium|hyperevm|robinhood)\/(testnet|mainnet)(\/.*)?$/);
  if (match) {
    const [, chain, stage, suffix = ""] = match;
    if (chain !== served.chain || stage !== served.stage) {
      return {
        kind: "mismatch",
        requestedTarget: `${chain}:${stage}`,
        servedTarget: `${served.chain}:${served.stage}`,
      };
    }
    return { kind: "canonical", pathname: `/v1${suffix}` };
  }
  if (pathname.startsWith("/v1/") && pathname !== "/v1/deployments") {
    return {
      kind: "legacy",
      pathname,
      successor: `/v1/${served.chain}/${served.stage}${pathname.slice(3)}`,
    };
  }
  return { kind: "unrelated", pathname };
}
