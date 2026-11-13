#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { operationalDatabaseUrl } from "./lib/database-url.mjs";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = await readFile(resolve("supabase/migrations/20261110020000_x_oauth.sql"), "utf8");
const client = new pg.Client({ connectionString: operationalDatabaseUrl(connectionString) });

await client.connect();
try {
  await client.query("select pg_advisory_lock($1)", [99802]);
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("commit");
    console.log("Applied the idempotent X OAuth migration to all network schemas.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
} finally {
  await client.query("select pg_advisory_unlock($1)", [99802]).catch(() => undefined);
  await client.end();
}
