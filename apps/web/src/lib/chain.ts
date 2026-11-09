import { ELYSIUM_NETWORKS, makeElysiumChain, parseNetwork } from "@squeez/shared";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

// All services load the selected root .env.testnet / .env.mainnet file.
export const network = parseNetwork(process.env.NEXT_PUBLIC_SQUEEZ_NETWORK);
export const networkInfo = ELYSIUM_NETWORKS[network];
export const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
if (!apiUrl) throw new Error(`NEXT_PUBLIC_API_URL must be set in .env.${network}.`);
export const elysium = makeElysiumChain(network, {
  id: network === "mainnet" ? 99901 : 99801,
  rpc: `${apiUrl}/rpc`,
});

export const wagmiConfig = createConfig({
  chains: [elysium],
  connectors: [injected()],
  transports: { [elysium.id]: http(`${apiUrl}/rpc`) },
  ssr: true,
});
