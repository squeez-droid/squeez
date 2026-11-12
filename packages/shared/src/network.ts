/** A deployment target is the product of a chain and a release stage. */
export const CHAINS = ["elysium", "hyperevm", "robinhood"] as const;
export const STAGES = ["testnet", "mainnet"] as const;

export type SqueezChain = (typeof CHAINS)[number];
export type Stage = (typeof STAGES)[number];
/** @deprecated Use `Stage`. Kept while existing Elysium services migrate without downtime. */
export type Network = Stage;

export interface DeploymentTarget {
  chain: SqueezChain;
  stage: Stage;
}

export const DEFAULT_CHAIN: SqueezChain = "elysium";
export const DEFAULT_STAGE: Stage = "testnet";
export const DEFAULT_NETWORK: Network = DEFAULT_STAGE;

export function isSqueezChain(value: string): value is SqueezChain {
  return (CHAINS as readonly string[]).includes(value);
}

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

export function parseChain(value: string | undefined): SqueezChain {
  if (!value) return DEFAULT_CHAIN;
  if (isSqueezChain(value)) return value;
  throw new Error(`Unknown chain "${value}". Expected one of: ${CHAINS.join(", ")}.`);
}

export function parseStage(value: string | undefined): Stage {
  if (!value) return DEFAULT_STAGE;
  if (isStage(value)) return value;
  throw new Error(`Unknown stage "${value}". Expected one of: ${STAGES.join(", ")}.`);
}

/** @deprecated Use `parseStage`. */
export const parseNetwork = parseStage;

export function parseDeploymentTarget(chain: string | undefined, stage: string | undefined): DeploymentTarget {
  return { chain: parseChain(chain), stage: parseStage(stage) };
}

export function deploymentTargetId({ chain, stage }: DeploymentTarget): `${SqueezChain}:${Stage}` {
  return `${chain}:${stage}`;
}

/** Stable Ponder/API data schema for one deployment target on the shared PostgreSQL instance. */
export function deploymentSchema({ chain, stage }: DeploymentTarget): string {
  return chain === "elysium" ? stage : `${chain}_${stage}`;
}

/** Keeps the deployed Elysium schema names stable while isolating every additional chain. */
export function operationalSchema({ chain, stage }: DeploymentTarget): string {
  return chain === "elysium" ? `${stage}_system` : `${chain}_${stage}_system`;
}
