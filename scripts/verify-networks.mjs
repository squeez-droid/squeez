#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const networks = [
  { name: "testnet", expectedChainId: 99801 },
  { name: "mainnet", expectedChainId: 99901 },
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

for (const network of networks) {
  const envPath = resolve(`apps/web/.env.${network.name}`);
  const env = parseEnv(await readFile(envPath, "utf8"));
  const configuredChainId = Number(env.NEXT_PUBLIC_ELYSIUM_CHAIN_ID);
  const rpcUrl = env.NEXT_PUBLIC_ELYSIUM_RPC;

  if (configuredChainId !== network.expectedChainId || !rpcUrl) {
    throw new Error(`${network.name}: expected chain ${network.expectedChainId} and a configured RPC`);
  }

  const [chainIdHex, blockHex] = await Promise.all([
    rpc(rpcUrl, "eth_chainId"),
    rpc(rpcUrl, "eth_blockNumber"),
  ]);
  const liveChainId = Number.parseInt(chainIdHex, 16);
  const latestBlock = Number.parseInt(blockHex, 16);

  if (liveChainId !== configuredChainId) {
    throw new Error(`${network.name}: RPC returned chain ${liveChainId}, expected ${configuredChainId}`);
  }
  if (!Number.isSafeInteger(latestBlock) || latestBlock <= 0) {
    throw new Error(`${network.name}: RPC returned invalid latest block ${blockHex}`);
  }

  console.log(`${network.name}: chain ${liveChainId}, latest block ${latestBlock}`);
}
