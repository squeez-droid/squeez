import {
  SQUEEZ_NETWORKS,
  deploymentTargetId,
  makeSqueezChain,
  parseDeploymentTarget,
} from "@squeez/shared";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

// All services load the selected root .env.testnet / .env.mainnet file.
export const deploymentTarget = parseDeploymentTarget(
  process.env.NEXT_PUBLIC_SQUEEZ_CHAIN,
  process.env.NEXT_PUBLIC_SQUEEZ_NETWORK,
);
export const network = deploymentTarget.stage;
export const networkInfo = SQUEEZ_NETWORKS[deploymentTargetId(deploymentTarget)];
export const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
if (!apiUrl) throw new Error(`NEXT_PUBLIC_API_URL must be set in .env.${network}.`);
export const activeChain = makeSqueezChain(networkInfo, `${apiUrl}/rpc`);
/** @deprecated Existing transaction components migrate to `activeChain` incrementally. */
export const elysium = activeChain;

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: { [activeChain.id]: http(`${apiUrl}/rpc`) },
  ssr: true,
});
