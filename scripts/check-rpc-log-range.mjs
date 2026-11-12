#!/usr/bin/env node

import { createPublicClient, http, zeroAddress } from "viem";

const usePrimary = process.argv.includes("--primary");
const useIndexer = process.argv.includes("--indexer");
const rpcVariable = useIndexer ? "INDEXER_RPC" : usePrimary ? "SQUEEZ_RPC" : "SQUEEZ_RPC_FALLBACK";
const rpc = process.env[rpcVariable]?.trim();
if (!rpc) throw new Error(`${rpcVariable} is required`);
const rangeArgument = process.argv.slice(2).find((argument) => /^\d+$/.test(argument));
const range = Number(rangeArgument || "2000");
if (!Number.isSafeInteger(range) || range < 1) throw new Error("Range must be a positive integer");

const client = createPublicClient({ transport: http(rpc, { timeout: 30_000 }) });
try {
  const head = await client.getBlockNumber();
  const fromBlock = head - BigInt(range - 1);
  await client.getLogs({ address: zeroAddress, fromBlock, toBlock: head });
  console.log(JSON.stringify({ ok: true, provider: new URL(rpc).hostname, range, fromBlock: Number(fromBlock), toBlock: Number(head) }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    provider: new URL(rpc).hostname,
    error: error instanceof Error && "details" in error ? String(error.details) : "RPC request failed",
  }, null, 2));
  process.exitCode = 1;
}
