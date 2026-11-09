#!/usr/bin/env node

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
const schema = process.env.DATABASE_SCHEMA?.trim();

if (!databaseUrl) throw new Error("DATABASE_URL is not configured in the selected root env file.");
if (!schema || !/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("DATABASE_SCHEMA is invalid.");
if (databaseUrl.startsWith("jdbc:")) throw new Error("DATABASE_URL must not use the jdbc: prefix; use postgresql://...");
if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
  throw new Error("DATABASE_URL must start with postgres:// or postgresql:// and must not be a masked placeholder.");
}
if (/\s/.test(databaseUrl)) throw new Error("DATABASE_URL contains whitespace. Paste it as one uninterrupted line.");

try {
  const parsed = new URL(databaseUrl);
  if (!parsed.hostname || !parsed.pathname.slice(1)) throw new Error("missing hostname or database name");
} catch {
  throw new Error("DATABASE_URL is malformed. URL-encode special characters in the username or password.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });

try {
  const connection = await pool.query("select current_database() as database, current_user as username, version() as version");
  const schemaResult = await pool.query("select exists(select 1 from information_schema.schemata where schema_name = $1) as exists", [schema]);
  const tableResult = await pool.query("select exists(select 1 from information_schema.tables where table_schema = $1 and table_name = 'token') as exists", [schema]);

  const version = String(connection.rows[0].version).match(/PostgreSQL\s+([^\s]+)/)?.[1] ?? "unknown";
  console.log(`Database connection passed (PostgreSQL ${version}).`);
  console.log(`Schema ${schema}: ${schemaResult.rows[0].exists ? "present" : "not created yet"}.`);
  console.log(`Indexer table ${schema}.token: ${tableResult.rows[0].exists ? "present" : "not created yet"}.`);
} finally {
  await pool.end();
}
