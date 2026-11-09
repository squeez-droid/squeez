import { ELYSIUM_NETWORKS, makeElysiumChain, parseNetwork } from "@squeez/shared";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

// All services load the selected root .env.testnet / .env.mainnet file.
export const network = parseNetwork(process.env.NEXT_PUBLIC_SQUEEZ_NETWORK);
export const networkInfo = ELYSIUM_NETWORKS[network];
export const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
if (!apiUrl) throw new Error(`NEXT_PUBLIC_API_URL must be set in .env.${network}.`);
function publicAddress(name: string, value: string | undefined) {
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error(`${name} must be configured for ${network}.`);
  return value as `0x${string}`;
}
export const swapRouterAddress = publicAddress("SWAP_ROUTER_ADDRESS", process.env.NEXT_PUBLIC_SWAP_ROUTER_ADDRESS);
export const v4QuoterAddress = publicAddress("V4_QUOTER_ADDRESS", process.env.NEXT_PUBLIC_V4_QUOTER_ADDRESS);
export const squeezHookAddress = publicAddress("SQUEEZ_HOOK_ADDRESS", process.env.NEXT_PUBLIC_SQUEEZ_HOOK_ADDRESS);
export const v4LpFee = Number(process.env.NEXT_PUBLIC_V4_LP_FEE_BPS);
export const v4TickSpacing = Number(process.env.NEXT_PUBLIC_V4_TICK_SPACING);
if (!Number.isInteger(v4LpFee) || !Number.isInteger(v4TickSpacing)) throw new Error("V4 pool parameters are invalid.");
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
