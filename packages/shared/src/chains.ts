import { defineChain, type Chain } from "viem";
import type { Network, SqueezChain, Stage } from "./network";

// Elysium (Kinetiq L2 on Hyperliquid). Chain IDs, RPCs and the PoolManager address must be
// taken from the official docs before deploying: https://elysium.kinetiq.xyz/docs

interface ElysiumNetworkInfo {
  name: string;
  testnet: boolean;
  explorer?: string;
  faucet?: string;
  bridge?: string;
}

export interface SqueezNetworkInfo {
  chain: SqueezChain;
  stage: Stage;
  chainId: number;
  name: string;
  shortName: string;
  nativeCurrency: { name: string; symbol: string; decimals: 18 };
  explorer: string;
  faucet?: string;
  bridge?: string;
  testnet: boolean;
}

export const SQUEEZ_NETWORKS: Record<`${SqueezChain}:${Stage}`, SqueezNetworkInfo> = {
  "elysium:testnet": {
    chain: "elysium", stage: "testnet", chainId: 99801, name: "Elysium Testnet", shortName: "Elysium",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    explorer: "https://explorer-elysium-testnet.t.conduit.xyz", testnet: true,
  },
  "elysium:mainnet": {
    chain: "elysium", stage: "mainnet", chainId: 99901, name: "Elysium", shortName: "Elysium",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, explorer: "", testnet: false,
  },
  "robinhood:testnet": {
    chain: "robinhood", stage: "testnet", chainId: 46630, name: "Robinhood Chain Testnet", shortName: "Robinhood",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    explorer: "https://explorer.testnet.chain.robinhood.com", testnet: true,
  },
  "robinhood:mainnet": {
    chain: "robinhood", stage: "mainnet", chainId: 4663, name: "Robinhood Chain", shortName: "Robinhood",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    explorer: "https://robinhoodchain.blockscout.com", testnet: false,
  },
};

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

export function makeSqueezChain(
  info: SqueezNetworkInfo,
  rpc: string,
  explorer = info.explorer,
): Chain {
  if (!rpc) throw new Error(`${info.name}: RPC must be configured.`);
  return defineChain({
    id: info.chainId,
    name: info.name,
    nativeCurrency: info.nativeCurrency,
    rpcUrls: { default: { http: [rpc] } },
    blockExplorers: explorer ? { default: { name: `${info.shortName} Explorer`, url: explorer } } : undefined,
    testnet: info.testnet,
  });
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
