#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const targets = [
  { chain: "elysium", stage: "testnet", prefix: "ELYSIUM", expectedChainId: 99801, schema: "testnet" },
  { chain: "elysium", stage: "mainnet", prefix: "ELYSIUM", expectedChainId: 99901, schema: "mainnet" },
  { chain: "robinhood", stage: "testnet", prefix: "ROBINHOOD", expectedChainId: 46630, schema: "robinhood_testnet" },
  { chain: "robinhood", stage: "mainnet", prefix: "ROBINHOOD", expectedChainId: 4663, schema: "robinhood_mainnet" },
];

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

async function rpc(url, method) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || typeof body.result !== "string") {
    throw new Error(`${method} returned an invalid JSON-RPC response`);
  }
  return body.result;
}

const failures = [];
for (const target of targets) {
  const label = `${target.chain}:${target.stage}`;
  try {
    const envPath = resolve(`.env.${target.stage}`);
    const env = parseEnv(await readFile(envPath, "utf8"));
    const configuredChainId = Number(env[`${target.prefix}_CHAIN_ID`]);
    const rpcUrl = env[`${target.prefix}_RPC`];
    const databaseSchema = target.chain === "elysium" ? env.DATABASE_SCHEMA : env[`${target.prefix}_DATABASE_SCHEMA`];

    if (configuredChainId !== target.expectedChainId || !rpcUrl) {
      throw new Error(`expected chain ${target.expectedChainId} and a configured RPC`);
    }
    if (databaseSchema !== target.schema) {
      throw new Error(`database schema must be '${target.schema}', received '${databaseSchema ?? "<unset>"}'`);
    }

    const [chainIdHex, blockHex] = await Promise.all([
      rpc(rpcUrl, "eth_chainId"),
      rpc(rpcUrl, "eth_blockNumber"),
    ]);
    const liveChainId = Number.parseInt(chainIdHex, 16);
    const latestBlock = Number.parseInt(blockHex, 16);

    if (liveChainId !== configuredChainId) {
      throw new Error(`RPC returned chain ${liveChainId}, expected ${configuredChainId}`);
    }
    if (!Number.isSafeInteger(latestBlock) || latestBlock <= 0) {
      throw new Error(`RPC returned invalid latest block ${blockHex}`);
    }

    console.log(`${label}: chain ${liveChainId}, latest block ${latestBlock}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    failures.push(`${label}: ${message}`);
    console.error(`${label}: FAILED (${message})`);
  }
}

if (failures.length > 0) throw new Error(`Network verification failed:\n${failures.join("\n")}`);
