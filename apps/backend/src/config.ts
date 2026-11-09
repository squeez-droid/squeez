import { parseNetwork } from "@squeez/shared";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function address(name: string): `0x${string}` | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error(`${name} must be an EVM address`);
  return value as `0x${string}`;
}

function optional(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export const backendConfig = {
  network: parseNetwork(process.env.SQUEEZ_NETWORK),
  port: Number(process.env.PORT ?? 8080),
  allowedOrigins: new Set(required("ALLOWED_ORIGINS").split(",").map((origin) => origin.trim())),
  rpcUrl: required("ELYSIUM_RPC"),
  chainId: Number(required("ELYSIUM_CHAIN_ID")),
  explorer: required("ELYSIUM_EXPLORER"),
  databaseUrl: required("DATABASE_URL"),
  databaseSchema: required("DATABASE_SCHEMA"),
  pinata: {
    jwt: optional("PINATA_JWT"),
    apiUrl: optional("PINATA_API_URL") ?? "https://api.pinata.cloud",
    gatewayUrl: optional("PINATA_GATEWAY_URL") ?? "https://gateway.pinata.cloud/ipfs",
  },
  contracts: {
    factory: address("FACTORY_ADDRESS"),
    quoteRegistry: address("QUOTE_REGISTRY_ADDRESS"),
    feeVault: address("FEE_VAULT_ADDRESS"),
  },
  launchConfig: {
    graduationThresholdHype: optional("GRADUATION_THRESHOLD_HYPE"),
    virtualHypeReserve: optional("VIRTUAL_HYPE_RESERVE"),
    virtualTokenReserve: optional("VIRTUAL_TOKEN_RESERVE"),
    sniperTaxStartBps: optional("SNIPER_TAX_START_BPS"),
    sniperTaxDecaySeconds: optional("SNIPER_TAX_DECAY_SECONDS"),
    maxWalletBps: optional("MAX_WALLET_BPS"),
    maxWalletWindowSeconds: optional("MAX_WALLET_WINDOW_SECONDS"),
    launchFeeHype: optional("LAUNCH_FEE_HYPE"),
  },
};

if (!Number.isSafeInteger(backendConfig.port) || backendConfig.port <= 0) throw new Error("PORT is invalid");
if (!Number.isSafeInteger(backendConfig.chainId) || backendConfig.chainId <= 0) throw new Error("ELYSIUM_CHAIN_ID is invalid");
if (!/^[a-z_][a-z0-9_]*$/.test(backendConfig.databaseSchema)) throw new Error("DATABASE_SCHEMA is invalid");
