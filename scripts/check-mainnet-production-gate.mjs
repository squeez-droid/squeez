#!/usr/bin/env node

import { spawnSync } from "node:child_process";

if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("Production gate is restricted to Robinhood mainnet");
}
if (Number(process.env.SQUEEZ_CHAIN_ID) !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");

const checks = [
  ["read-only service isolation", ["scripts/check-mainnet-read-only-compose.mjs"]],
  ["target schema isolation", ["--experimental-strip-types", "scripts/check-target-schemas.mjs"]],
  ["deployment address book", ["scripts/check-loaded-deployment-addresses.mjs"]],
  ["deployment manifest and proxies", ["scripts/verify-deployment.mjs"]],
  ["primary and fallback RPC", ["scripts/check-rpc-pair.mjs"]],
  ["deployment RPC consistency", ["scripts/check-deployment-rpc-consistency.mjs"]],
  ["final admin ownership", ["scripts/check-admin-ownership-final.mjs"]],
  ["governance timelock", ["scripts/verify-governance-timelock.mjs"]],
  ["official v4 infrastructure", ["scripts/check-robinhood-v4-infrastructure.mjs"]],
  ["active v4 wiring", ["scripts/check-v4-activation.mjs"]],
  ["v4 runtime bytecode", ["scripts/check-v4-runtime-bytecode.mjs"]],
  ["protected-launch policy", ["scripts/check-protected-launch-mainnet.mjs"]],
  ["database and schema", ["scripts/check-database.mjs"]],
  ["indexer preflight", ["--experimental-strip-types", "scripts/preflight-indexer.mjs"]],
  ["indexer read-only lag policy", ["scripts/check-mainnet-indexer-lag.mjs", "--allow-read-only"]],
  ["Coolify mainnet resources", ["scripts/check-coolify-mainnet-resources.mjs"]],
];

const results = [];
for (const [name, args] of checks) {
  process.stdout.write(`\n[gate] ${name}\n`);
  const result = spawnSync(process.execPath, args, { env: process.env, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  results.push({ name, passed: result.status === 0, exitCode: result.status ?? 1 });
}

const failed = results.filter((result) => !result.passed);
console.log(`\n${JSON.stringify({
  ready: failed.length === 0,
  target: "robinhood:mainnet",
  capability: "read-only",
  checksPassed: results.length - failed.length,
  checksTotal: results.length,
  failed: failed.map(({ name, exitCode }) => ({ name, exitCode })),
}, null, 2)}`);
if (failed.length) process.exitCode = 1;
