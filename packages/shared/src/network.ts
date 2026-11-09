/** Squeez runs one deployment per Elysium network. Each app picks it from its `.env.<network>` file. */
export const NETWORKS = ["testnet", "mainnet"] as const;

export type Network = (typeof NETWORKS)[number];

export const DEFAULT_NETWORK: Network = "testnet";

function isNetwork(value: string): value is Network {
  return (NETWORKS as readonly string[]).includes(value);
}

/** Reads a network name from env. Empty means the default; anything unknown is a config error. */
export function parseNetwork(value: string | undefined): Network {
  if (!value) return DEFAULT_NETWORK;
  if (isNetwork(value)) return value;
  throw new Error(`Unknown network "${value}". Expected one of: ${NETWORKS.join(", ")}.`);
}
