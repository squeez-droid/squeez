#!/usr/bin/env node

import pg from "pg";

const confirmation = "--confirm-reset-empty-robinhood-mainnet";
if (!process.argv.includes(confirmation)) throw new Error(`Refusing to reset without ${confirmation}`);
if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("This command only supports robinhood:mainnet");
}
if (process.env.DATABASE_SCHEMA !== "robinhood_mainnet") throw new Error("DATABASE_SCHEMA must be robinhood_mainnet");
if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required");

const productTables = [
  "token", "trade", "holder_balance", "creator_fee", "protocol_fee",
  "protected_purchase", "protection_tax", "identity", "burn",
];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock($1)", [4663]);
  for (const table of productTables) {
    const exists = await client.query(
      "select to_regclass($1) is not null as exists",
      [`robinhood_mainnet.${table}`],
    );
    if (!exists.rows[0].exists) continue;
    const count = await client.query(`select count(*)::bigint as count from "robinhood_mainnet"."${table}"`);
    if (BigInt(count.rows[0].count) !== 0n) throw new Error(`Refusing reset: robinhood_mainnet.${table} is not empty`);
  }
  await client.query('drop schema "robinhood_mainnet" cascade');
  await client.query('create schema "robinhood_mainnet"');
  await client.query("comment on schema robinhood_mainnet is 'Squeez indexed Robinhood mainnet data (owned by Ponder)' ");
  await client.query('grant usage on schema "robinhood_mainnet" to anon, authenticated, service_role');
  await client.query('alter default privileges in schema "robinhood_mainnet" grant select on tables to anon, authenticated');
  await client.query('alter default privileges in schema "robinhood_mainnet" grant all on tables to service_role');
  await client.query("commit");
  console.log("Reset empty robinhood_mainnet Ponder schema; other schemas and operational logs were preserved.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
