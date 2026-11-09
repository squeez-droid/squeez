import { createConfig } from "ponder";
import { SqueezLaunchFactoryAbi } from "./abis/SqueezLaunchFactory";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Loaded from .env.testnet / .env.mainnet by `npm run dev` / `start:<network>`.
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
    // TODO: SqueezCurve (factory pattern: one curve per token), SqueezHook, SqueezFeeVault
  },
});
