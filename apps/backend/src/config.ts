import { deploymentSchema, operationalSchema, parseDeploymentTarget } from "@squeez/shared";

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

const target = parseDeploymentTarget(process.env.SQUEEZ_CHAIN, process.env.SQUEEZ_NETWORK);
const capability = process.env.SQUEEZ_API_CAPABILITY?.trim() || "enabled";
if (!['enabled', 'read-only'].includes(capability)) throw new Error("SQUEEZ_API_CAPABILITY must be enabled or read-only");

export const backendConfig = {
  chain: target.chain,
  network: target.stage,
  target,
  capability: capability as "enabled" | "read-only",
  systemLogSchema: operationalSchema(target),
  port: Number(process.env.PORT ?? 8080),
  allowedOrigins: new Set(required("ALLOWED_ORIGINS").split(",").map((origin) => origin.trim())),
  rpcUrl: required("SQUEEZ_RPC"),
  rpcFallbackUrl: optional("SQUEEZ_RPC_FALLBACK"),
  chainId: Number(required("SQUEEZ_CHAIN_ID")),
  explorer: required("SQUEEZ_EXPLORER"),
  databaseUrl: required("DATABASE_URL"),
  databaseSchema: required("DATABASE_SCHEMA"),
  crossChainDatabaseSchema: optional("CROSS_CHAIN_DATABASE_SCHEMA"),
  pinata: {
    jwt: optional("PINATA_JWT"),
    apiUrl: optional("PINATA_API_URL") ?? "https://api.pinata.cloud",
    uploadUrl: optional("PINATA_UPLOAD_URL") ?? "https://uploads.pinata.cloud/v3/files",
    gatewayUrl: optional("PINATA_GATEWAY_URL") ?? "https://gateway.pinata.cloud/ipfs",
  },
  xAttestation: {
    enabled: process.env.X_OAUTH_ENABLED === "true",
    clientId: optional("X_CLIENT_ID"),
    clientSecret: optional("X_CLIENT_SECRET"),
    redirectUri: optional("X_REDIRECT_URI"),
    attesterPrivateKey: optional("SQUEEZ_ATTESTER_PRIVATE_KEY"),
    maxLaunchesPer24h: Number(process.env.X_MAX_ATTESTED_LAUNCHES_PER_24H ?? 3),
  },
  contracts: {
    factory: address("FACTORY_ADDRESS"),
    quoteRegistry: address("QUOTE_REGISTRY_ADDRESS"),
    feeVault: address("FEE_VAULT_ADDRESS"),
    swapRouter: address("SWAP_ROUTER_ADDRESS"),
    v4Quoter: address("V4_QUOTER_ADDRESS"),
    squeezHook: address("SQUEEZ_HOOK_ADDRESS"),
  },
  quoteAssets: {
    usdc: address("USDC_ADDRESS"),
    unit: address("UNIT_ASSET_ADDRESS"),
    ondo: address("ONDO_ASSET_ADDRESS"),
  },
  v4Pool: {
    lpFeeBps: optional("V4_LP_FEE_BPS"),
    tickSpacing: optional("V4_TICK_SPACING"),
  },
  launchConfig: {
    graduationThresholdHype: optional("GRADUATION_THRESHOLD_HYPE"),
    virtualHypeReserve: optional("VIRTUAL_HYPE_RESERVE")
      ?? (optional("GRADUATION_THRESHOLD_HYPE") ? (BigInt(optional("GRADUATION_THRESHOLD_HYPE")!) * 2n / 5n).toString() : null),
    virtualTokenReserve: optional("VIRTUAL_TOKEN_RESERVE") ?? "1000000000000000000000000000",
    sniperTaxStartBps: optional("SNIPER_TAX_START_BPS"),
    sniperTaxDecaySeconds: optional("SNIPER_TAX_DECAY_SECONDS"),
    maxWalletBps: optional("MAX_WALLET_BPS"),
    maxWalletWindowSeconds: optional("MAX_WALLET_WINDOW_SECONDS"),
    launchFeeHype: optional("LAUNCH_FEE_HYPE"),
  },
};

if (!Number.isSafeInteger(backendConfig.port) || backendConfig.port <= 0) throw new Error("PORT is invalid");
if (!Number.isSafeInteger(backendConfig.chainId) || backendConfig.chainId <= 0) throw new Error("SQUEEZ_CHAIN_ID is invalid");
if (!Number.isSafeInteger(backendConfig.xAttestation.maxLaunchesPer24h)
  || backendConfig.xAttestation.maxLaunchesPer24h <= 0) throw new Error("X_MAX_ATTESTED_LAUNCHES_PER_24H is invalid");
if (backendConfig.xAttestation.enabled && (!backendConfig.xAttestation.clientId
  || !backendConfig.xAttestation.clientSecret || !backendConfig.xAttestation.redirectUri)) {
  throw new Error("X OAuth is enabled but its backend-only credentials are incomplete");
}
if (backendConfig.xAttestation.attesterPrivateKey
  && !/^0x[a-fA-F0-9]{64}$/.test(backendConfig.xAttestation.attesterPrivateKey)) {
  throw new Error("SQUEEZ_ATTESTER_PRIVATE_KEY must be a 32-byte hex private key");
}
if (!/^[a-z_][a-z0-9_]*$/.test(backendConfig.databaseSchema)) throw new Error("DATABASE_SCHEMA is invalid");
const expectedDatabaseSchema = deploymentSchema(target);
if (backendConfig.databaseSchema !== expectedDatabaseSchema) {
  throw new Error(`DATABASE_SCHEMA mismatch: ${target.chain}:${target.stage} requires ${expectedDatabaseSchema}`);
}
if (backendConfig.crossChainDatabaseSchema
  && !/^[a-z_][a-z0-9_]*$/.test(backendConfig.crossChainDatabaseSchema)) {
  throw new Error("CROSS_CHAIN_DATABASE_SCHEMA is invalid");
}
