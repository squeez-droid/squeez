#!/usr/bin/env node
// Runs a command with the env file of one network loaded.
//
//   node ../../tools/with-env.mjs [elysium|hyperevm|robinhood] <testnet|mainnet> <command> [args...]
//
// Reads `.env.<network>` from the current working directory (the workspace that calls it).
// Variables already set in the shell win, so CI and secret managers can override the file.
// Empty values (`KEY=`) are treated as unset. Each app validates its required values.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_TO_ENV, loadDeploymentEnv } from "./deployment-address-book.mjs";

const NETWORKS = ["testnet", "mainnet"];
const CHAINS = ["elysium", "hyperevm", "robinhood"];

function fail(message) {
  console.error(`with-env: ${message}`);
  process.exit(1);
}

function parseEnvFile(text) {
  const vars = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (value) vars[key] = value;
  }
  return vars;
}

const args = process.argv.slice(2);
const explicitChain = CHAINS.includes(args[0]);
const chain = explicitChain ? args.shift() : (process.env.SQUEEZ_CHAIN || "elysium");
const network = args.shift();
const command = args;

if (!CHAINS.includes(chain)) fail(`chain must be one of: ${CHAINS.join(", ")}`);
if (!NETWORKS.includes(network)) fail(`first argument must be one of: ${NETWORKS.join(", ")}`);
if (command.length === 0) fail("missing command to run");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(repositoryRoot, `.env.${network}`);
const fileEnv = existsSync(envFile) ? parseEnvFile(readFileSync(envFile, "utf8")) : {};
if (!existsSync(envFile) && process.env.SQUEEZ_NETWORK !== network) {
  fail(`${envFile} not found and SQUEEZ_NETWORK=${network} was not supplied by the runtime.`);
}

// Local testnet and mainnet intentionally share one PostgreSQL instance. Mainnet may omit DATABASE_URL and inherit
// only that credential from the root testnet env; DATABASE_SCHEMA remains selected independently below. Hosted
// services should inject the same DATABASE_URL secret into both process definitions.
if (network === "mainnet" && !fileEnv.DATABASE_URL && !process.env.DATABASE_URL) {
  const testnetEnvFile = resolve(repositoryRoot, ".env.testnet");
  if (existsSync(testnetEnvFile)) {
    const sharedDatabaseUrl = parseEnvFile(readFileSync(testnetEnvFile, "utf8")).DATABASE_URL;
    if (sharedDatabaseUrl) fileEnv.DATABASE_URL = sharedDatabaseUrl;
  }
}

let deploymentEnv = {};
try {
  deploymentEnv = loadDeploymentEnv(repositoryRoot, network, chain).values;
} catch (error) {
  fail(error instanceof Error ? error.message : "invalid deployment address book");
}
// Deployment output is authoritative over copied .env addresses. A non-empty runtime variable remains an
// intentional emergency override (for example in CI); empty Coolify variables do not hide the address book.
const runtimeEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value?.trim()));
const legacyDeploymentKeys = new Set(Object.values(FIELD_TO_ENV));
const walletKeys = [
  "DEPLOYER_PRIVATE_KEY", "UPGRADE_ADMIN_PRIVATE_KEY", "ADMIN_MULTISIG", "NEXT_ADMIN_MULTISIG", "TREASURY",
  "KEEPER_PRIVATE_KEY",
];
if (chain !== "elysium") {
  // The original root env used unprefixed contract fields for Elysium. Never let those values leak into another
  // chain; Robinhood receives addresses only from its own address book or an explicit runtime override.
  for (const key of legacyDeploymentKeys) delete fileEnv[key];
  const reuseKey = `${chain.toUpperCase()}_REUSE_ELYSIUM_WALLETS`;
  const reuseElysiumWallets = (runtimeEnv[reuseKey] ?? fileEnv[reuseKey]) === "true";
  if (!reuseElysiumWallets) for (const key of walletKeys) delete fileEnv[key];
}
const chainPrefix = chain.toUpperCase();
const chainSource = { ...fileEnv, ...runtimeEnv };
const prefixedOverrides = {};
for (const key of [
  ...legacyDeploymentKeys,
  ...walletKeys,
  "MAX_BUY_BPS_PER_TRANSACTION", "MAX_WALLET_BPS", "MAX_WALLET_WINDOW_SECONDS",
  "SNIPER_TAX_START_BPS", "SNIPER_TAX_DECAY_SECONDS", "TICKER_LOCK_SECONDS",
  "LAUNCH_FEE_HYPE", "GRADUATION_THRESHOLD_HYPE",
  "USDC_ADDRESS", "UNIT_ASSET_ADDRESS", "ONDO_ASSET_ADDRESS",
  "QUOTE_ORACLE_ADDRESS", "QUOTE_ORACLE_MAX_AGE_SECONDS",
  "GOVERNANCE_TIMELOCK_DELAY_SECONDS", "GOVERNANCE_TIMELOCK_ADDRESS",
  "GOVERNANCE_SAFE_ADDRESS",
]) {
  const value = chainSource[`${chainPrefix}_${key}`];
  if (value?.trim()) prefixedOverrides[key] = value;
}
const selectedChainEnv = {
  // Hosted single-target containers commonly inject the canonical unprefixed keys. Prefer a chain-qualified
  // value when present, but never erase an explicit runtime value merely because the root dotenv file is absent.
  SQUEEZ_CHAIN_ID: chainSource[`${chainPrefix}_CHAIN_ID`] ?? chainSource.SQUEEZ_CHAIN_ID,
  SQUEEZ_RPC: chainSource[`${chainPrefix}_RPC`] ?? chainSource.SQUEEZ_RPC,
  SQUEEZ_RPC_FALLBACK: chainSource[`${chainPrefix}_RPC_FALLBACK`] ?? chainSource.SQUEEZ_RPC_FALLBACK,
  SQUEEZ_EXPLORER: chainSource[`${chainPrefix}_EXPLORER`] ?? chainSource.SQUEEZ_EXPLORER,
  // Keep provider limits target-specific. A conservative public testnet RPC must not throttle
  // a production provider (or another chain), while the legacy unprefixed keys remain fallbacks.
  INDEXER_MAX_REQUESTS_PER_SECOND: chainSource[`${chainPrefix}_INDEXER_MAX_REQUESTS_PER_SECOND`]
    ?? chainSource.INDEXER_MAX_REQUESTS_PER_SECOND,
  INDEXER_LOG_BLOCK_RANGE: chainSource[`${chainPrefix}_INDEXER_LOG_BLOCK_RANGE`]
    ?? chainSource.INDEXER_LOG_BLOCK_RANGE,
  INDEXER_RPC: chainSource[`${chainPrefix}_INDEXER_RPC`] ?? chainSource.INDEXER_RPC,
  INDEXER_START_BLOCK: chainSource[`${chainPrefix}_INDEXER_START_BLOCK`] ?? chainSource.INDEXER_START_BLOCK,
  DATABASE_SCHEMA: chainSource[`${chainPrefix}_DATABASE_SCHEMA`] ?? chainSource.DATABASE_SCHEMA,
  CROSS_CHAIN_DATABASE_SCHEMA: chain === "robinhood"
    ? (chainSource.ELYSIUM_DATABASE_SCHEMA ?? chainSource.DATABASE_SCHEMA)
    : chainSource.ROBINHOOD_DATABASE_SCHEMA,
};
const env = {
  ...fileEnv,
  ...selectedChainEnv,
  ...prefixedOverrides,
  ...deploymentEnv,
  ...runtimeEnv,
  // Chain-qualified values are the final authority for routing/provider settings. This prevents a legacy
  // unprefixed secret (for example Coolify's INDEXER_RPC) from silently routing Robinhood to another provider.
  ...selectedChainEnv,
  ...prefixedOverrides,
  SQUEEZ_CHAIN: chain,
  SQUEEZ_NETWORK: network,
};
// The browser receives only the public API URL and network selector. Public contract routing data is fetched from
// `/v1/config`, keeping every network value behind the same backend boundary as RPC access.
// Preserve argv boundaries. Joining into a shell string loses quoting, makes ordinary `node -e` commands fail,
// and lets values intended as arguments be interpreted as shell syntax.
const child = spawn(command[0], command.slice(1), { env, shell: false, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
