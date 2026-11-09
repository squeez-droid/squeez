import { ELYSIUM_NETWORKS, makeElysiumChain, parseNetwork } from "@squeez/shared";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

// Network settings come from .env.testnet / .env.mainnet (see the .example files).
export const network = parseNetwork(process.env.NEXT_PUBLIC_SQUEEZ_NETWORK);
export const networkInfo = ELYSIUM_NETWORKS[network];
export const elysium = makeElysiumChain(network, {
  id: Number(process.env.NEXT_PUBLIC_ELYSIUM_CHAIN_ID) || undefined,
  rpc: process.env.NEXT_PUBLIC_ELYSIUM_RPC,
  explorer: process.env.NEXT_PUBLIC_ELYSIUM_EXPLORER,
});

export const wagmiConfig = createConfig({
  chains: [elysium],
  connectors: [injected()],
  transports: { [elysium.id]: http() },
  ssr: true,
});
