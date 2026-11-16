import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const FIELD_TO_ENV = {
  chainConfigStartBlock: "CHAIN_CONFIG_START_BLOCK",
  chainConfig: "CHAIN_CONFIG_ADDRESS",
  chainConfigImplementation: "CHAIN_CONFIG_IMPLEMENTATION_ADDRESS",
  startBlock: "FACTORY_START_BLOCK",
  factory: "FACTORY_ADDRESS",
  factoryImplementation: "FACTORY_IMPLEMENTATION_ADDRESS",
  quoteRegistry: "QUOTE_REGISTRY_ADDRESS",
  quoteRegistryImplementation: "QUOTE_REGISTRY_IMPLEMENTATION_ADDRESS",
  protectionPolicyRegistry: "PROTECTION_POLICY_REGISTRY_ADDRESS",
  protectionPolicyRegistryImplementation: "PROTECTION_POLICY_REGISTRY_IMPLEMENTATION_ADDRESS",
  identityRegistry: "IDENTITY_REGISTRY_ADDRESS",
  identityRegistryImplementation: "IDENTITY_REGISTRY_IMPLEMENTATION_ADDRESS",
  tokenDeployer: "TOKEN_DEPLOYER_ADDRESS",
  tokenBeacon: "TOKEN_BEACON_ADDRESS",
  tokenImplementation: "TOKEN_IMPLEMENTATION_ADDRESS",
  curveProxyDeployer: "CURVE_PROXY_DEPLOYER_ADDRESS",
  feeVault: "FEE_VAULT_ADDRESS",
  feeVaultImplementation: "FEE_VAULT_IMPLEMENTATION_ADDRESS",
  curveBeacon: "CURVE_BEACON_ADDRESS",
  curveImplementation: "CURVE_IMPLEMENTATION_ADDRESS",
  squeezToken: "SQUEEZ_TOKEN_ADDRESS",
  liquidityLocker: "LIQUIDITY_LOCKER_ADDRESS",
  graduationAdapter: "GRADUATION_ADAPTER_ADDRESS",
  squeezHook: "SQUEEZ_HOOK_ADDRESS",
  poolManager: "POOL_MANAGER",
  poolManagerStartBlock: "POOL_MANAGER_START_BLOCK",
  positionManager: "POSITION_MANAGER",
  permit2: "PERMIT2",
  universalRouter: "UNIVERSAL_ROUTER",
  wrappedNative: "WRAPPED_NATIVE_ADDRESS",
  positionDescriptor: "POSITION_DESCRIPTOR_ADDRESS",
  stateView: "V4_STATE_VIEW_ADDRESS",
  v4Quoter: "V4_QUOTER_ADDRESS",
  swapRouter: "SWAP_ROUTER_ADDRESS",
  swapRouterStartBlock: "SWAP_ROUTER_START_BLOCK",
  lpFeeBps: "V4_LP_FEE_BPS",
  tickSpacing: "V4_TICK_SPACING",
  graduationThresholdHype: "GRADUATION_THRESHOLD_HYPE",
  virtualHypeReserve: "VIRTUAL_HYPE_RESERVE",
  virtualTokenReserve: "VIRTUAL_TOKEN_RESERVE",
  sniperTaxStartBps: "SNIPER_TAX_START_BPS",
  sniperTaxDecaySeconds: "SNIPER_TAX_DECAY_SECONDS",
  maxBuyBpsPerTransaction: "MAX_BUY_BPS_PER_TRANSACTION",
  maxWalletBps: "MAX_WALLET_BPS",
  maxWalletWindowSeconds: "MAX_WALLET_WINDOW_SECONDS",
  launchFeeHype: "LAUNCH_FEE_HYPE",
};

export function loadDeploymentEnv(repositoryRoot, network, chain = "elysium") {
  const directory = resolve(repositoryRoot, "packages/contracts/deployments");
  const targetDirectory = resolve(directory, chain);
  const suffixes = ["", "-chain-config", "-core-upgrade", "-curve-upgrade", "-v4-stack", "-graduation",
    "-graduation-infra", "-hook", "-hook-config", "-swap-router", "-launch-config", "-protected-launch", "-attester",
    "-token-proxy", "-token-proxy-activation", "-token-upgrade"];
  const nestedPaths = suffixes.map((suffix) => resolve(targetDirectory, `${network}${suffix}.json`));
  // Preserve the deployed Elysium address book until its files are mechanically moved and verified.
  const legacyPaths = chain === "elysium"
    ? suffixes.map((suffix) => resolve(directory, `${network}${suffix}.json`))
    : [];
  const paths = nestedPaths.some(existsSync) ? nestedPaths : [...legacyPaths, ...nestedPaths];
  const existingPaths = paths.filter(existsSync);
  if (existingPaths.length === 0) return { paths, values: {} };

  const deployment = {};
  let deploymentChainId;
  for (const path of existingPaths) {
    const fragment = JSON.parse(readFileSync(path, "utf8"));
    if (fragment.network && fragment.network !== network) {
      throw new Error(`deployment network mismatch in ${path}`);
    }
    if (fragment.chain && fragment.chain !== chain) {
      throw new Error(`deployment chain mismatch in ${path}`);
    }
    if (fragment.chainId !== undefined) {
      const fragmentChainId = Number(fragment.chainId);
      if (!Number.isSafeInteger(fragmentChainId) || fragmentChainId <= 0) {
        throw new Error(`deployment chain ID is invalid in ${path}`);
      }
      if (deploymentChainId !== undefined && fragmentChainId !== deploymentChainId) {
        throw new Error(`deployment chain ID mismatch in ${path}`);
      }
      deploymentChainId = fragmentChainId;
    }
    Object.assign(deployment, fragment);
  }

  const values = {};
  for (const [field, envName] of Object.entries(FIELD_TO_ENV)) {
    const value = deployment[field];
    if (value !== undefined && value !== null && String(value).trim()) values[envName] = String(value);
  }
  return { paths: existingPaths, values };
}
