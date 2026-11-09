#!/usr/bin/env node

import pg from "pg";

const confirmation = "--confirm-reset-testnet";
if (!process.argv.includes(confirmation)) {
  throw new Error(`Refusing to reset without ${confirmation}`);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
const network = process.env.SQUEEZ_NETWORK?.trim();

if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
if (network !== "testnet") {
  throw new Error(`Refusing to reset network ${network ?? "<unset>"}; this command is testnet-only.`);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
const client = await pool.connect();

try {
  await client.query("begin");

  // Fixed identifiers only: never accept schema names from arguments or environment.
  await client.query('drop schema if exists "testnet_v3" cascade');
  await client.query('drop schema if exists "testnet_v2" cascade');
  await client.query('drop schema if exists "testnet" cascade');
  await client.query('create schema "testnet"');
  await client.query("comment on schema testnet is 'Squeez indexed Elysium testnet data (owned by Ponder)'");
  await client.query("grant usage on schema testnet to anon, authenticated, service_role");
  await client.query("alter default privileges in schema testnet grant select on tables to anon, authenticated");
  await client.query("alter default privileges in schema testnet grant all on tables to service_role");

  await client.query("commit");
  console.log("Reset testnet indexer schemas successfully.");
  console.log("Preserved testnet_system and all mainnet schemas.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
