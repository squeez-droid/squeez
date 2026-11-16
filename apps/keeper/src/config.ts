import { isAddress, isHex, type Hex } from "viem";
import { deploymentSchema, operationalSchema, parseDeploymentTarget, type Address } from "@squeez/shared";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name} (see .env.<network>.example)`);
  return value;
}

export function loadConfig() {
  const target = parseDeploymentTarget(process.env.SQUEEZ_CHAIN, process.env.SQUEEZ_NETWORK);
  const network = target.stage;
  const rpc = required("SQUEEZ_RPC");
  const chainId = Number(required("SQUEEZ_CHAIN_ID"));
  const privateKey = required("KEEPER_PRIVATE_KEY");
  const databaseUrl = required("DATABASE_URL");
  const databaseSchema = required("DATABASE_SCHEMA");
  const graduationEnabled = process.env.GRADUATION_KEEPER_ENABLED !== "false";
  const buybackEnabled = process.env.BUYBACK_KEEPER_ENABLED === "true";
  const intervalSeconds = Number(process.env.GRADUATION_KEEPER_INTERVAL_SECONDS ?? 15);
  const feeVault = process.env.FEE_VAULT_ADDRESS?.trim() || null;
  const squeezToken = process.env.SQUEEZ_TOKEN_ADDRESS?.trim() || null;
  const chunkHype = Number(process.env.TWAP_CHUNK_HYPE ?? 0);

  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("SQUEEZ_CHAIN_ID must be a positive integer");
  if (!URL.canParse(rpc)) throw new Error("SQUEEZ_RPC must be a valid URL");
  if (!isHex(privateKey) || privateKey.length !== 66) throw new Error("KEEPER_PRIVATE_KEY must be a 32-byte hex key");
  if (!URL.canParse(databaseUrl)) throw new Error("DATABASE_URL must be a valid URL");
  if (databaseSchema !== deploymentSchema(target)) throw new Error(`DATABASE_SCHEMA must be ${deploymentSchema(target)}`);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
    throw new Error("GRADUATION_KEEPER_INTERVAL_SECONDS must be at least 5 seconds");
  }
  if (buybackEnabled) {
    if (!feeVault || !isAddress(feeVault)) throw new Error("FEE_VAULT_ADDRESS must be a valid address");
    if (!squeezToken || !isAddress(squeezToken)) throw new Error("SQUEEZ_TOKEN_ADDRESS must be a valid address");
    if (!Number.isFinite(chunkHype) || chunkHype <= 0) throw new Error("TWAP_CHUNK_HYPE must be positive");
  }

  return {
    network,
    chain: target.chain,
    rpc,
    chainId,
    target,
    privateKey: privateKey as Hex,
    databaseUrl,
    databaseSchema,
    systemLogSchema: operationalSchema(target),
    graduationEnabled,
    buybackEnabled,
    feeVault: feeVault as Address | null,
    squeezToken: squeezToken as Address | null,
    intervalMs: intervalSeconds * 1000,
    chunkHype,
  };
}

export type KeeperConfig = ReturnType<typeof loadConfig>;
