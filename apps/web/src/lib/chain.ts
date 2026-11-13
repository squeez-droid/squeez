import {
  SQUEEZ_NETWORKS,
  deploymentTargetId,
  makeSqueezChain,
  parseDeploymentTarget,
} from "@squeez/shared";
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

// All services load the selected root .env.testnet / .env.mainnet file.
export const deploymentTarget = parseDeploymentTarget(
  process.env.NEXT_PUBLIC_SQUEEZ_CHAIN,
  process.env.NEXT_PUBLIC_SQUEEZ_NETWORK,
);
export const network = deploymentTarget.stage;
export const networkInfo = SQUEEZ_NETWORKS[deploymentTargetId(deploymentTarget)];
export const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
if (!apiUrl) throw new Error(`NEXT_PUBLIC_API_URL must be set in .env.${network}.`);
export const targetApiUrl = `${apiUrl}/v1/${deploymentTarget.chain}/${deploymentTarget.stage}`;
export const activeChain = makeSqueezChain(networkInfo, `${targetApiUrl}/rpc`);
/** @deprecated Existing transaction components migrate to `activeChain` incrementally. */
export const elysium = activeChain;

export const supportedChains = Object.values(SQUEEZ_NETWORKS).map((info) => {
  const url = `${apiUrl}/v1/${info.chain}/${info.stage}`;
  return makeSqueezChain(info, `${url}/rpc`);
}) as [ReturnType<typeof makeSqueezChain>, ...ReturnType<typeof makeSqueezChain>[]];

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
const walletConnectConnector = walletConnectProjectId
  && typeof window !== "undefined"
  ? walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: "Squeez",
        description: "Multichain on-chain token launchpad",
        url: "https://squeez.tech",
        icons: ["https://squeez.tech/icon.png"],
      },
    })
  : null;

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected(), ...(walletConnectConnector ? [walletConnectConnector] : [])],
  transports: Object.fromEntries(Object.values(SQUEEZ_NETWORKS).map((info) => [
    info.chainId,
    http(`${apiUrl}/v1/${info.chain}/${info.stage}/rpc`),
  ])),
  ssr: true,
});
