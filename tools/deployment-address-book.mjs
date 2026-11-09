import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIELD_TO_ENV = {
  startBlock: "FACTORY_START_BLOCK",
  factory: "FACTORY_ADDRESS",
  factoryImplementation: "FACTORY_IMPLEMENTATION_ADDRESS",
  quoteRegistry: "QUOTE_REGISTRY_ADDRESS",
  quoteRegistryImplementation: "QUOTE_REGISTRY_IMPLEMENTATION_ADDRESS",
  feeVault: "FEE_VAULT_ADDRESS",
  feeVaultImplementation: "FEE_VAULT_IMPLEMENTATION_ADDRESS",
  curveBeacon: "CURVE_BEACON_ADDRESS",
  curveImplementation: "CURVE_IMPLEMENTATION_ADDRESS",
  squeezToken: "SQUEEZ_TOKEN_ADDRESS",
  liquidityLocker: "LIQUIDITY_LOCKER_ADDRESS",
  graduationAdapter: "GRADUATION_ADAPTER_ADDRESS",
  squeezHook: "SQUEEZ_HOOK_ADDRESS",
  poolManager: "POOL_MANAGER",
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
  maxWalletBps: "MAX_WALLET_BPS",
  maxWalletWindowSeconds: "MAX_WALLET_WINDOW_SECONDS",
  launchFeeHype: "LAUNCH_FEE_HYPE",
};

export function loadDeploymentEnv(repositoryRoot, network) {
  const directory = resolve(repositoryRoot, "packages/contracts/deployments");
  const paths = [
    resolve(directory, `${network}.json`),
    resolve(directory, `${network}-core-upgrade.json`),
    resolve(directory, `${network}-curve-upgrade.json`),
    resolve(directory, `${network}-v4-stack.json`),
    resolve(directory, `${network}-graduation.json`),
    resolve(directory, `${network}-graduation-infra.json`),
    resolve(directory, `${network}-hook.json`),
    resolve(directory, `${network}-hook-config.json`),
    resolve(directory, `${network}-swap-router.json`),
    resolve(directory, `${network}-launch-config.json`),
  ];
  const existingPaths = paths.filter(existsSync);
  if (existingPaths.length === 0) return { paths, values: {} };

  const deployment = {};
  for (const path of existingPaths) {
    const fragment = JSON.parse(readFileSync(path, "utf8"));
    if (fragment.network && fragment.network !== network) {
      throw new Error(`deployment network mismatch in ${path}`);
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
