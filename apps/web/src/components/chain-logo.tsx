import type { SqueezChain, Stage } from "@squeez/shared";
import clsx from "clsx";

const LABELS: Record<SqueezChain, string> = {
  robinhood: "Robinhood Chain",
  hyperevm: "HyperEVM",
  elysium: "Elysium",
};

export function ChainLogo({ chain, size = 24, className }: { chain: SqueezChain; size?: number; className?: string }) {
  return (
    // The three brand marks are bundled locally so token cards never depend on a third-party CDN.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/chains/${chain}.svg`} alt={`${LABELS[chain]} logo`} width={size} height={size}
      className={clsx("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  );
}

export function ChainBadge({ chain, stage, size = 18, className }: {
  chain: SqueezChain;
  stage?: Stage;
  size?: number;
  className?: string;
}) {
  return (
    <span title={`${LABELS[chain]}${stage ? ` ${stage}` : ""}`} className={clsx("absolute -bottom-1 -right-1 z-10 rounded-full border-2 border-bg bg-bg shadow-md", className)}>
      <ChainLogo chain={chain} size={size} />
    </span>
  );
}

export const chainLabel = (chain: SqueezChain) => LABELS[chain];
