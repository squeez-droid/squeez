import { defineChain, type Chain } from "viem";
import type { Network } from "./network";

// Elysium (Kinetiq L2 on Hyperliquid). Chain IDs, RPCs and the PoolManager address must be
// taken from the official docs before deploying: https://elysium.kinetiq.xyz/docs

interface ElysiumNetworkInfo {
  name: string;
  testnet: boolean;
  explorer?: string;
  faucet?: string;
  bridge?: string;
}

export const ELYSIUM_NETWORKS: Record<Network, ElysiumNetworkInfo> = {
  testnet: {
    name: "Elysium Testnet",
    testnet: true,
  },
  mainnet: {
    name: "Elysium",
    testnet: false,
  },
};

interface ChainOverrides {
  id?: number;
  rpc?: string;
  explorer?: string;
}

export function makeElysiumChain(network: Network, overrides: ChainOverrides = {}): Chain {
  const info = ELYSIUM_NETWORKS[network];
  const id = overrides.id;
  const rpc = overrides.rpc;
  const explorer = overrides.explorer ?? info.explorer;

  if (!id || !rpc) {
    throw new Error(`Elysium ${network}: chain ID and RPC must be set in .env.${network}.`);
  }

  return defineChain({
    id,
    name: info.name,
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    blockExplorers: explorer ? { default: { name: "Elysium Explorer", url: explorer } } : undefined,
    testnet: info.testnet,
  });
}
