#!/usr/bin/env node
// Runs a command with the env file of one network loaded.
//
//   node ../../tools/with-env.mjs <testnet|mainnet> <command> [args...]
//
// Reads `.env.<network>` from the current working directory (the workspace that calls it).
// Variables already set in the shell win, so CI and secret managers can override the file.
// Empty values (`KEY=`) are treated as unset. Each app validates its required values.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentEnv } from "./deployment-address-book.mjs";

const NETWORKS = ["testnet", "mainnet"];

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

const [network, ...command] = process.argv.slice(2);

if (!NETWORKS.includes(network)) fail(`first argument must be one of: ${NETWORKS.join(", ")}`);
if (command.length === 0) fail("missing command to run");

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(repositoryRoot, `.env.${network}`);
const fileEnv = existsSync(envFile) ? parseEnvFile(readFileSync(envFile, "utf8")) : {};
if (!existsSync(envFile) && process.env.SQUEEZ_NETWORK !== network) {
  fail(`${envFile} not found and SQUEEZ_NETWORK=${network} was not supplied by the runtime.`);
}

let deploymentEnv = {};
try {
  deploymentEnv = loadDeploymentEnv(repositoryRoot, network).values;
} catch (error) {
  fail(error instanceof Error ? error.message : "invalid deployment address book");
}
// Deployment output is authoritative over copied .env addresses. A non-empty runtime variable remains an
// intentional emergency override (for example in CI); empty Coolify variables do not hide the address book.
const runtimeEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value?.trim()));
const env = { ...fileEnv, ...deploymentEnv, ...runtimeEnv };
// Contract addresses and non-secret pool parameters are intentionally exposed to the browser bundle.
// Secrets (RPC upstream keys, database URLs, private keys, Pinata JWT) never receive a NEXT_PUBLIC alias.
env.NEXT_PUBLIC_SWAP_ROUTER_ADDRESS ??= env.SWAP_ROUTER_ADDRESS;
env.NEXT_PUBLIC_V4_QUOTER_ADDRESS ??= env.V4_QUOTER_ADDRESS;
env.NEXT_PUBLIC_SQUEEZ_HOOK_ADDRESS ??= env.SQUEEZ_HOOK_ADDRESS;
env.NEXT_PUBLIC_V4_LP_FEE_BPS ??= env.V4_LP_FEE_BPS;
env.NEXT_PUBLIC_V4_TICK_SPACING ??= env.V4_TICK_SPACING;
const child = spawn(command.join(" "), { env, shell: true, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
