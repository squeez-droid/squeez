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
import { resolve } from "node:path";

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

const envFile = resolve(process.cwd(), `.env.${network}`);
if (!existsSync(envFile)) {
  fail(`${envFile} not found. Copy .env.${network}.example to .env.${network} and fill it in.`);
}

const env = { ...parseEnvFile(readFileSync(envFile, "utf8")), ...process.env };
const child = spawn(command.join(" "), { env, shell: true, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
