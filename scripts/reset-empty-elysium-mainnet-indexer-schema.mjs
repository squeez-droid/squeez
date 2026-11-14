#!/usr/bin/env node

import pg from "pg";

const confirmation = "--confirm-reset-empty-elysium-mainnet";
if (!process.argv.includes(confirmation)) throw new Error(`Refusing to reset without ${confirmation}`);
if (process.env.SQUEEZ_CHAIN !== "elysium" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("This reset is restricted to elysium:mainnet");
}
if (process.env.DATABASE_SCHEMA !== "mainnet") throw new Error("DATABASE_SCHEMA must be mainnet");
if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required");

const deploymentStartBlock = Number(process.env.FACTORY_START_BLOCK);
const releaseStartBlock = Number(process.env.INDEXER_START_BLOCK);
if (!Number.isSafeInteger(releaseStartBlock) || releaseStartBlock < deploymentStartBlock) {
  throw new Error("INDEXER_START_BLOCK must be a validated block at or after FACTORY_START_BLOCK");
}

const productTables = [
  "token", "trade", "holder_balance", "creator_fee", "protocol_fee",
  "protected_purchase", "protection_tax", "identity", "burn",
];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock($1)", [99901]);
  const previousCounts = {};
  for (const table of productTables) {
    const exists = await client.query("select to_regclass($1) is not null as exists", [`mainnet.${table}`]);
    if (!exists.rows[0].exists) {
      previousCounts[table] = "0";
      continue;
    }
    const count = await client.query(`select count(*)::bigint as count from "mainnet"."${table}"`);
    previousCounts[table] = count.rows[0].count;
    if (BigInt(count.rows[0].count) !== 0n) {
      throw new Error(`Refusing reset: mainnet.${table} contains ${count.rows[0].count} rows`);
    }
  }

  await client.query('drop schema "mainnet" cascade');
  await client.query('create schema "mainnet"');
  await client.query("comment on schema mainnet is 'Squeez Elysium mainnet indexed on-chain data (owned by Ponder)'");
  await client.query('grant usage on schema "mainnet" to anon, authenticated, service_role');
  await client.query('alter default privileges in schema "mainnet" grant select on tables to anon, authenticated');
  await client.query('alter default privileges in schema "mainnet" grant all on tables to service_role');
  await client.query("commit");
  console.log(JSON.stringify({ reset: true, schema: "mainnet", releaseStartBlock, previousCounts }, null, 2));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
