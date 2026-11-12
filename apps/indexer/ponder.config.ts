import { createConfig, factory } from "ponder";
import { deploymentSchema, parseDeploymentTarget } from "@squeez/shared";
import { parseAbiItem } from "viem";
import { SqueezLaunchFactoryAbi } from "./abis/SqueezLaunchFactory";
import { SqueezCurveAbi } from "./abis/SqueezCurve";
import { SqueezFeeVaultAbi } from "./abis/SqueezFeeVault";
import { SqueezSwapRouterAbi } from "./abis/SqueezSwapRouter";
import { SqueezTokenAbi } from "./abis/SqueezToken";
import { SqueezIdentityRegistryAbi } from "./abis/SqueezIdentityRegistry";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const target = parseDeploymentTarget(process.env.SQUEEZ_CHAIN, process.env.SQUEEZ_NETWORK);
const configuredSchema = required("DATABASE_SCHEMA");
const expectedSchema = deploymentSchema(target);
if (configuredSchema !== expectedSchema) {
  throw new Error(`DATABASE_SCHEMA mismatch: ${target.chain}:${target.stage} requires ${expectedSchema}`);
}
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
const deploymentStartBlock = Number(required("FACTORY_START_BLOCK"));
const factoryStartBlock = Number(process.env.INDEXER_START_BLOCK?.trim() || deploymentStartBlock);
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("SQUEEZ_CHAIN_ID must be a positive integer");
if (!Number.isSafeInteger(deploymentStartBlock) || deploymentStartBlock < 0) {
  throw new Error("FACTORY_START_BLOCK must be a non-negative integer");
}
if (!Number.isSafeInteger(factoryStartBlock) || factoryStartBlock < deploymentStartBlock) {
  throw new Error("INDEXER_START_BLOCK must be an integer at or after FACTORY_START_BLOCK");
}
const swapRouterAddress = process.env.SWAP_ROUTER_ADDRESS?.trim();
const swapRouterStartBlock = process.env.SWAP_ROUTER_START_BLOCK?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const indexerRpc = process.env.INDEXER_RPC?.trim() || required("SQUEEZ_RPC");
const databasePoolMax = Number(process.env.INDEXER_DATABASE_POOL_MAX?.trim() || "5");
if ((swapRouterAddress && !swapRouterStartBlock) || (!swapRouterAddress && swapRouterStartBlock)) {
  throw new Error("SWAP_ROUTER_ADDRESS and SWAP_ROUTER_START_BLOCK must be configured together");
}
if (!Number.isSafeInteger(databasePoolMax) || databasePoolMax < 5) {
  throw new Error("INDEXER_DATABASE_POOL_MAX must be an integer greater than or equal to 5");
}

// Loaded from the selected root .env.testnet / .env.mainnet file.
// DATABASE_URL + DATABASE_SCHEMA are read by Ponder itself (one Supabase schema per network).
export default createConfig({
  database: databaseUrl
    ? { kind: "postgres", connectionString: databaseUrl, poolConfig: { max: databasePoolMax } }
    : { kind: "pglite", directory: ".ponder/pglite" },
  chains: {
    target: {
      id: chainId,
      rpc: indexerRpc,
      // Keep historical backfills within entry-level provider capacity; production may raise this explicitly.
      maxRequestsPerSecond: Number(process.env.INDEXER_MAX_REQUESTS_PER_SECOND?.trim() || "2"),
      ethGetLogsBlockRange: Number(process.env.INDEXER_LOG_BLOCK_RANGE?.trim() || "10"),
    },
  },
  contracts: {
    SqueezLaunchFactory: {
      chain: "target",
      abi: SqueezLaunchFactoryAbi,
      address: required("FACTORY_ADDRESS") as `0x${string}`,
      startBlock: factoryStartBlock,
    },
    SqueezCurve: {
      chain: "target",
      abi: SqueezCurveAbi,
      address: factory({
        address: required("FACTORY_ADDRESS") as `0x${string}`,
        event: parseAbiItem(
          "event TokenLaunched(address indexed token,address indexed curve,address indexed creator,address quote,uint16 creatorFeeBps,uint256 launchConfigId,address feeRecipient,uint8 feeDestinationKind,uint16 buybackBps)",
        ),
        parameter: "curve",
        startBlock: factoryStartBlock,
      }),
      startBlock: factoryStartBlock,
    },
    SqueezToken: {
      chain: "target",
      abi: SqueezTokenAbi,
      address: factory({
        address: required("FACTORY_ADDRESS") as `0x${string}`,
        event: parseAbiItem(
          "event TokenLaunched(address indexed token,address indexed curve,address indexed creator,address quote,uint16 creatorFeeBps,uint256 launchConfigId,address feeRecipient,uint8 feeDestinationKind,uint16 buybackBps)",
        ),
        parameter: "token",
        startBlock: factoryStartBlock,
      }),
      startBlock: factoryStartBlock,
    },
    SqueezFeeVault: {
      chain: "target",
      abi: SqueezFeeVaultAbi,
      address: required("FEE_VAULT_ADDRESS") as `0x${string}`,
      startBlock: factoryStartBlock,
    },
    SqueezSwapRouter: {
      chain: "target",
      abi: SqueezSwapRouterAbi,
      // Zero address is a no-op target until the router has an authoritative deployment fragment.
      address: (swapRouterAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      startBlock: Math.max(factoryStartBlock, swapRouterStartBlock ? Number(swapRouterStartBlock) : factoryStartBlock),
    },
    SqueezIdentityRegistry: {
      chain: "target",
      abi: SqueezIdentityRegistryAbi,
      // Zero address is an intentional no-op compatibility target until a registry is deployed on this chain.
      address: (process.env.IDENTITY_REGISTRY_ADDRESS?.trim()
        || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      startBlock: factoryStartBlock,
    },
  },
});
