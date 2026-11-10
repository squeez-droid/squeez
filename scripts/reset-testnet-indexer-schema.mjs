#!/usr/bin/env node

import pg from "pg";

const chain = process.env.SQUEEZ_CHAIN?.trim() || "elysium";
const targets = {
  elysium: {
    schema: "testnet",
    confirmation: "--confirm-reset-elysium-testnet",
    legacyConfirmation: "--confirm-reset-testnet",
    description: "Squeez indexed Elysium testnet data (owned by Ponder)",
  },
  robinhood: {
    schema: "robinhood_testnet",
    confirmation: "--confirm-reset-robinhood-testnet",
    description: "Squeez indexed Robinhood testnet data (owned by Ponder)",
  },
};
const target = targets[chain];
if (!target) throw new Error(`Unsupported reset target: ${chain}`);
const confirmation = target.confirmation;
if (!process.argv.includes(confirmation) && !(target.legacyConfirmation && process.argv.includes(target.legacyConfirmation))) {
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

  // Identifiers come only from the fixed map above; environment values are never interpolated as schema names.
  const schema = `"${target.schema}"`;
  await client.query(`drop schema if exists ${schema} cascade`);
  await client.query(`create schema ${schema}`);
  await client.query(`comment on schema ${schema} is '${target.description}'`);
  await client.query(`grant usage on schema ${schema} to anon, authenticated, service_role`);
  await client.query(`alter default privileges in schema ${schema} grant select on tables to anon, authenticated`);
  await client.query(`alter default privileges in schema ${schema} grant all on tables to service_role`);

  await client.query("commit");
  console.log(`Reset ${chain} testnet indexer schema successfully.`);
  console.log("Preserved operational-log schemas, the other testnet target, and all mainnet schemas.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
