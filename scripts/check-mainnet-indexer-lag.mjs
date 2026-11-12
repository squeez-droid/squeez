#!/usr/bin/env node

import pg from "pg";

if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("Indexer lag check is restricted to Robinhood mainnet");
}
if (Number(process.env.SQUEEZ_CHAIN_ID) !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const startBlock = Number(required("FACTORY_START_BLOCK"));
const maxLagBlocks = Number(process.env.INDEXER_MAX_LAG_BLOCKS ?? 2_000);
const staleSeconds = Number(process.env.INDEXER_STALE_SECONDS ?? 300);
if (!Number.isSafeInteger(startBlock) || startBlock < 0) throw new Error("FACTORY_START_BLOCK is invalid");

const rpcResponse = await fetch(required("SQUEEZ_RPC"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  signal: AbortSignal.timeout(10_000),
});
if (!rpcResponse.ok) throw new Error(`RPC returned ${rpcResponse.status}`);
const rpcPayload = await rpcResponse.json();
if (!rpcPayload.result) throw new Error("RPC block number is unavailable");
const rpcBlock = Number(BigInt(rpcPayload.result));

const pool = new pg.Pool({ connectionString: required("DATABASE_URL"), max: 1, connectionTimeoutMillis: 10_000 });
let row;
try {
  const result = await pool.query(`select
      substring(latest_checkpoint from 27 for 16)::bigint as "blockNumber",
      (select (value->>'heartbeat_at')::bigint / 1000 from "robinhood_mainnet"._ponder_meta
        where key = 'app' limit 1) as "updatedAt"
    from "robinhood_mainnet"._ponder_checkpoint where chain_id = 4663 limit 1`);
  row = result.rows[0];
} finally {
  await pool.end();
}
const indexerBlock = row ? Number(row.blockNumber) : null;
const updatedAt = row ? Number(row.updatedAt) : null;
const checkedAt = Math.floor(Date.now() / 1_000);
const lagBlocks = indexerBlock === null ? null : Math.max(0, rpcBlock - indexerBlock);
const totalBackfillBlocks = Math.max(0, rpcBlock - startBlock);
const indexedBackfillBlocks = indexerBlock === null ? 0 : Math.max(0, indexerBlock - startBlock);
const progressPercent = totalBackfillBlocks === 0 ? 100
  : Math.min(100, Number(((BigInt(indexedBackfillBlocks) * 10_000n) / BigInt(totalBackfillBlocks))) / 100);
const checkpointAgeSeconds = updatedAt === null ? null : Math.max(0, checkedAt - updatedAt);
const stale = lagBlocks === null || lagBlocks > maxLagBlocks
  || (lagBlocks > 0 && checkpointAgeSeconds !== null && checkpointAgeSeconds > staleSeconds);
console.log(JSON.stringify({
  readyForWrites: !stale,
  capabilityRecommendation: stale ? "read-only" : "eligible-for-canary-review",
  chainId: 4663,
  startBlock,
  rpcBlock,
  indexerBlock,
  lagBlocks,
  checkpointAgeSeconds,
  backfill: { indexedBlocks: indexedBackfillBlocks, totalBlocks: totalBackfillBlocks, progressPercent },
  thresholds: { maxLagBlocks, staleSeconds },
}, null, 2));
if (stale && !process.argv.includes("--allow-read-only")) process.exitCode = 2;
