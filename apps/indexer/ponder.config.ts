import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";
import { SqueezLaunchFactoryAbi } from "./abis/SqueezLaunchFactory";
import { SqueezCurveAbi } from "./abis/SqueezCurve";
import { SqueezFeeVaultAbi } from "./abis/SqueezFeeVault";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Loaded from the selected root .env.testnet / .env.mainnet file.
// DATABASE_URL + DATABASE_SCHEMA are read by Ponder itself (one Supabase schema per network).
export default createConfig({
  chains: {
    elysium: {
      id: Number(required("ELYSIUM_CHAIN_ID")),
      rpc: required("ELYSIUM_RPC"),
    },
  },
  contracts: {
    SqueezLaunchFactory: {
      chain: "elysium",
      abi: SqueezLaunchFactoryAbi,
      address: required("FACTORY_ADDRESS") as `0x${string}`,
      startBlock: Number(required("FACTORY_START_BLOCK")),
    },
    SqueezCurve: {
      chain: "elysium",
      abi: SqueezCurveAbi,
      address: factory({
        address: required("FACTORY_ADDRESS") as `0x${string}`,
        event: parseAbiItem(
          "event TokenLaunched(address indexed token,address indexed curve,address indexed creator,address quote,uint16 creatorFeeBps,uint256 launchConfigId,address feeRecipient,uint8 feeDestinationKind,uint16 buybackBps)",
        ),
        parameter: "curve",
        startBlock: Number(required("FACTORY_START_BLOCK")),
      }),
      startBlock: Number(required("FACTORY_START_BLOCK")),
    },
    SqueezFeeVault: {
      chain: "elysium",
      abi: SqueezFeeVaultAbi,
      address: required("FEE_VAULT_ADDRESS") as `0x${string}`,
      startBlock: Number(required("FACTORY_START_BLOCK")),
    },
    // TODO: SqueezHook
  },
});
