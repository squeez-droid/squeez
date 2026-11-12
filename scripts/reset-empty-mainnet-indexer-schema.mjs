#!/usr/bin/env node

import pg from "pg";

const confirmation = "--confirm-reset-empty-robinhood-mainnet";
if (!process.argv.includes(confirmation)) throw new Error(`Refusing to reset without ${confirmation}`);
if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("This reset is restricted to robinhood:mainnet");
}
if (process.env.DATABASE_SCHEMA !== "robinhood_mainnet") {
  throw new Error("DATABASE_SCHEMA must be robinhood_mainnet");
}
const databaseUrl = process.env.DATABASE_URL?.trim();
const deploymentStartBlock = Number(process.env.FACTORY_START_BLOCK);
const releaseStartBlock = Number(process.env.INDEXER_START_BLOCK);
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!Number.isSafeInteger(releaseStartBlock) || releaseStartBlock < deploymentStartBlock) {
  throw new Error("INDEXER_START_BLOCK must be the validated mainnet release block");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock($1)", [4663]);
  const counts = await client.query(`select
    (select count(*)::bigint from robinhood_mainnet.token) as tokens,
    (select count(*)::bigint from robinhood_mainnet.trade) as trades,
    (select count(*)::bigint from robinhood_mainnet.creator_fee) as creator_fees,
    (select count(*)::bigint from robinhood_mainnet.protocol_fee) as protocol_fees`);
  const populated = Object.entries(counts.rows[0]).filter(([, value]) => BigInt(value) !== 0n);
  if (populated.length) throw new Error(`Refusing to reset populated mainnet schema: ${JSON.stringify(counts.rows[0])}`);

  await client.query("drop schema robinhood_mainnet cascade");
  await client.query("create schema robinhood_mainnet");
  await client.query("comment on schema robinhood_mainnet is 'Squeez Robinhood mainnet indexed on-chain data (owned by Ponder)'");
  await client.query("grant usage on schema robinhood_mainnet to anon, authenticated, service_role");
  await client.query("alter default privileges in schema robinhood_mainnet grant select on tables to anon, authenticated");
  await client.query("alter default privileges in schema robinhood_mainnet grant all on tables to service_role");
  await client.query("commit");
  console.log(JSON.stringify({ reset: true, schema: "robinhood_mainnet", releaseStartBlock, previousCounts: counts.rows[0] }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
