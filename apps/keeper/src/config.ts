import { isAddress, isHex } from "viem";
import { parseDeploymentTarget, type Address } from "@squeez/shared";

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
  const feeVault = required("FEE_VAULT_ADDRESS");
  const squeezToken = required("SQUEEZ_TOKEN_ADDRESS");
  const intervalSeconds = Number(required("TWAP_INTERVAL_SECONDS"));
  const chunkHype = Number(required("TWAP_CHUNK_HYPE"));

  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("SQUEEZ_CHAIN_ID must be a positive integer");
  if (!URL.canParse(rpc)) throw new Error("SQUEEZ_RPC must be a valid URL");
  if (!isHex(privateKey) || privateKey.length !== 66) throw new Error("KEEPER_PRIVATE_KEY must be a 32-byte hex key");
  if (!isAddress(feeVault)) throw new Error("FEE_VAULT_ADDRESS must be a valid address");
  if (!isAddress(squeezToken)) throw new Error("SQUEEZ_TOKEN_ADDRESS must be a valid address");
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) throw new Error("TWAP_INTERVAL_SECONDS must be positive");
  if (!Number.isFinite(chunkHype) || chunkHype <= 0) throw new Error("TWAP_CHUNK_HYPE must be positive");

  return {
    network,
    chain: target.chain,
    rpc,
    chainId,
    privateKey: privateKey as Address,
    feeVault: feeVault as Address,
    squeezToken: squeezToken as Address,
    intervalMs: intervalSeconds * 1000,
    chunkHype,
  };
}

export type KeeperConfig = ReturnType<typeof loadConfig>;
