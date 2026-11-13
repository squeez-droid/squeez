import { SQUEEZ_NETWORKS, deploymentSchema, deploymentTargetId, operationalSchema, parseDeploymentTarget } from "@squeez/shared";

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
const networkInfo = SQUEEZ_NETWORKS[deploymentTargetId(target)];
const capability = process.env.SQUEEZ_API_CAPABILITY?.trim() || "enabled";
if (!['enabled', 'read-only'].includes(capability)) throw new Error("SQUEEZ_API_CAPABILITY must be enabled or read-only");
const releaseMode = process.env.SQUEEZ_RELEASE_MODE?.trim()
  || (target.stage === "mainnet" ? "internal" : "public-beta");
if (!["internal", "community-canary", "public-beta"].includes(releaseMode)) {
  throw new Error("SQUEEZ_RELEASE_MODE must be internal, community-canary, or public-beta");
}
const communityTestingEnabled = process.env.SQUEEZ_COMMUNITY_TESTING_ENABLED === "true";

export const backendConfig = {
  chain: target.chain,
  network: target.stage,
  target,
  networkInfo,
  capability: capability as "enabled" | "read-only",
  release: {
    mode: releaseMode as "internal" | "community-canary" | "public-beta",
    communityTestingEnabled,
    maxOpeningBuyWei: optional("SQUEEZ_COMMUNITY_MAX_OPENING_BUY_WEI") ?? "10000000000000000",
    acknowledgementVersion: optional("SQUEEZ_RISK_ACK_VERSION") ?? "robinhood-mainnet-canary-v1",
  },
  indexerMaxLagBlocks: Number(process.env.INDEXER_MAX_LAG_BLOCKS ?? 2_000),
  indexerStaleSeconds: Number(process.env.INDEXER_STALE_SECONDS ?? 300),
  systemLogSchema: operationalSchema(target),
  port: Number(process.env.PORT ?? 8080),
  allowedOrigins: new Set(required("ALLOWED_ORIGINS").split(",").map((origin) => origin.trim())),
  publicApiUrl: optional("PUBLIC_API_URL") ?? optional("NEXT_PUBLIC_API_URL") ?? "https://api.squeez.tech",
  rpcUrl: required("SQUEEZ_RPC"),
  rpcFallbackUrl: optional("SQUEEZ_RPC_FALLBACK"),
  chainId: Number(required("SQUEEZ_CHAIN_ID")),
  nativeCurrencySymbol: networkInfo.nativeCurrency.symbol,
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
    required: process.env.X_ATTESTATION_REQUIRED === "true",
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
try {
  const publicApiUrl = new URL(backendConfig.publicApiUrl);
  if (!["http:", "https:"].includes(publicApiUrl.protocol)) throw new Error("unsupported protocol");
} catch {
  throw new Error("PUBLIC_API_URL must be an absolute HTTP(S) URL");
}
if (!Number.isSafeInteger(backendConfig.chainId) || backendConfig.chainId <= 0) throw new Error("SQUEEZ_CHAIN_ID is invalid");
if (!Number.isSafeInteger(backendConfig.indexerMaxLagBlocks) || backendConfig.indexerMaxLagBlocks < 0) {
  throw new Error("INDEXER_MAX_LAG_BLOCKS must be a non-negative integer");
}
if (!Number.isSafeInteger(backendConfig.indexerStaleSeconds) || backendConfig.indexerStaleSeconds <= 0) {
  throw new Error("INDEXER_STALE_SECONDS must be a positive integer");
}
if (!/^\d+$/.test(backendConfig.release.maxOpeningBuyWei)
  || BigInt(backendConfig.release.maxOpeningBuyWei) < 0n) {
  throw new Error("SQUEEZ_COMMUNITY_MAX_OPENING_BUY_WEI must be a non-negative integer in wei");
}
if (backendConfig.network === "mainnet" && backendConfig.capability === "enabled"
  && (!backendConfig.release.communityTestingEnabled || backendConfig.release.mode === "internal")) {
  throw new Error("Mainnet writes require SQUEEZ_COMMUNITY_TESTING_ENABLED=true and a non-internal SQUEEZ_RELEASE_MODE");
}
if (!Number.isSafeInteger(backendConfig.xAttestation.maxLaunchesPer24h)
  || backendConfig.xAttestation.maxLaunchesPer24h <= 0) throw new Error("X_MAX_ATTESTED_LAUNCHES_PER_24H is invalid");
if (backendConfig.xAttestation.enabled && (!backendConfig.xAttestation.clientId
  || !backendConfig.xAttestation.clientSecret || !backendConfig.xAttestation.redirectUri)) {
  throw new Error("X OAuth is enabled but its backend-only credentials are incomplete");
}
if (backendConfig.xAttestation.required && (!backendConfig.xAttestation.enabled
  || !backendConfig.xAttestation.attesterPrivateKey)) {
  throw new Error("Required creator attestation needs X OAuth and an attester key");
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
