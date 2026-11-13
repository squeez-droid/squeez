#!/usr/bin/env node

import pg from "pg";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { deploymentSchema, parseDeploymentTarget } from "../packages/shared/src/network.ts";
import { operationalDatabaseUrl } from "./lib/database-url.mjs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const target = parseDeploymentTarget(process.env.SQUEEZ_CHAIN, process.env.SQUEEZ_NETWORK);
const schema = required("DATABASE_SCHEMA");
const expectedSchema = deploymentSchema(target);
if (schema !== expectedSchema) throw new Error(`Schema mismatch: expected ${expectedSchema}, received ${schema}`);

const expectedChainId = Number(required("SQUEEZ_CHAIN_ID"));
const startBlock = Number(required("FACTORY_START_BLOCK"));
const factory = required("FACTORY_ADDRESS");
if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) throw new Error("SQUEEZ_CHAIN_ID is invalid");
if (!Number.isSafeInteger(startBlock) || startBlock < 0) throw new Error("FACTORY_START_BLOCK is invalid");
if (!isAddress(factory)) throw new Error("FACTORY_ADDRESS is invalid");

const indexerRpc = process.env.INDEXER_RPC?.trim() || required("SQUEEZ_RPC");
const client = createPublicClient({ transport: http(indexerRpc, { timeout: 15_000 }) });
const pool = new pg.Pool({
  connectionString: operationalDatabaseUrl(required("DATABASE_URL")),
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  // Keep RPC probes sequential. Entry-level/public providers commonly reject the four-request burst that
  // Promise.all creates, even when each individual request is valid.
  const chainId = await client.getChainId();
  const head = await client.getBlockNumber();
  const code = await client.getBytecode({ address: getAddress(factory) });
  const startBlockData = await client.getBlock({ blockNumber: BigInt(startBlock) });
  const schemaResult = await pool.query(
    "select exists(select 1 from information_schema.schemata where schema_name=$1) as exists",
    [schema],
  );
  if (chainId !== expectedChainId) throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${chainId}`);
  if (BigInt(startBlock) > head) throw new Error(`Start block ${startBlock} is ahead of RPC head ${head}`);
  if (!code || code === "0x") throw new Error("Factory has no bytecode at the current RPC head");
  if (!startBlockData.hash) throw new Error(`RPC could not retrieve deployment start block ${startBlock}`);

  console.log(JSON.stringify({
    ok: true,
    target: `${target.chain}:${target.stage}`,
    chainId,
    schema,
    schemaPresent: Boolean(schemaResult.rows[0]?.exists),
    factory: getAddress(factory),
    startBlock,
    rpcHead: Number(head),
    blocksToBackfill: Number(head - BigInt(startBlock)),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    target: `${target.chain}:${target.stage}`,
    provider: new URL(indexerRpc).hostname,
    error: error instanceof Error
      ? ("details" in error && error.details ? String(error.details) : error.message)
      : "Indexer preflight failed",
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
