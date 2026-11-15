#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

function loadLocalEnv() {
  if (!existsSync(".env.migration")) return;
  for (const raw of readFileSync(".env.migration", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
    if (value && !process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

function normalizePostgresUrl(value) {
  if (!value) return value;
  try {
    new URL(value);
    return value;
  } catch {
    const schemeEnd = value.indexOf("://");
    const authorityEnd = value.lastIndexOf("@");
    const passwordStart = value.indexOf(":", schemeEnd + 3);
    if (schemeEnd < 0 || passwordStart < 0 || authorityEnd <= passwordStart) {
      throw new Error("Database connection string is invalid");
    }
    const prefix = value.slice(0, passwordStart + 1);
    const password = value.slice(passwordStart + 1, authorityEnd);
    return `${prefix}${encodeURIComponent(password)}${value.slice(authorityEnd)}`;
  }
}

function existingDatabaseUrl() {
  if (process.env.SOURCE_DATABASE_URL?.trim()) return process.env.SOURCE_DATABASE_URL.trim();
  if (!existsSync(".env.testnet")) return undefined;
  for (const raw of readFileSync(".env.testnet", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("DATABASE_URL=")) continue;
    return line.slice("DATABASE_URL=".length).trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  }
}

const sourceUrl = normalizePostgresUrl(existingDatabaseUrl());
const targetUrl = normalizePostgresUrl(process.env.TARGET_DATABASE_URL?.trim());
if (!sourceUrl || !targetUrl) throw new Error("Source DATABASE_URL and TARGET_DATABASE_URL are required");

function projectRef(value) {
  const url = new URL(value);
  return decodeURIComponent(url.username).split(".")[1]
    ?? url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
    ?? url.hostname;
}
if (projectRef(sourceUrl) === projectRef(targetUrl)) throw new Error("Source and target resolve to the same project");

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm-copy-durable-data")) {
  throw new Error("--apply requires --confirm-copy-durable-data");
}

const schemas = [
  "testnet_system", "mainnet_system",
  "robinhood_testnet_system", "robinhood_mainnet_system",
  "hyperevm_testnet_system", "hyperevm_mainnet_system",
];
const tables = [
  {
    name: "identity_image_evidence",
    columns: ["metadata_uri_hash", "image_hash", "perceptual_hash", "name_commitment", "symbol_commitment", "wallet", "created_at"],
    where: "true",
  },
  {
    name: "x_creator_session",
    columns: ["session_hash", "wallet", "x_user_id_hash", "username", "expires_at", "created_at", "revoked_at"],
    where: "expires_at > now() and revoked_at is null",
  },
  {
    name: "x_attestation_usage",
    columns: ["id", "wallet", "x_user_id_hash", "chain_id", "factory", "nonce", "created_at"],
    where: "true",
  },
];

function quote(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe identifier: ${identifier}`);
  return `"${identifier}"`;
}

async function exists(client, schema, table) {
  const result = await client.query("select to_regclass($1) is not null as available", [`${schema}.${table}`]);
  return Boolean(result.rows[0]?.available);
}

async function insertRows(client, schema, table, rows) {
  if (rows.length === 0) return 0;
  const batchSize = 250;
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = table.columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    const result = await client.query(
      `insert into ${quote(schema)}.${quote(table.name)} (${table.columns.map(quote).join(",")}) values ${tuples.join(",")} on conflict do nothing`,
      values,
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

const source = new pg.Client({ connectionString: sourceUrl, statement_timeout: 60_000 });
const target = new pg.Client({ connectionString: targetUrl, statement_timeout: 60_000 });
await Promise.all([source.connect(), target.connect()]);
const report = { mode: apply ? "apply" : "dry-run", sourceProject: projectRef(sourceUrl), targetProject: projectRef(targetUrl), tables: [] };
try {
  if (apply) await target.query("begin");
  for (const schema of schemas) {
    for (const table of tables) {
      const sourceExists = await exists(source, schema, table.name);
      const targetExists = await exists(target, schema, table.name);
      if (!sourceExists || !targetExists) {
        report.tables.push({ schema, table: table.name, sourceExists, targetExists, selected: 0, inserted: 0 });
        continue;
      }
      const selected = await source.query(
        `select ${table.columns.map(quote).join(",")} from ${quote(schema)}.${quote(table.name)} where ${table.where}`,
      );
      const inserted = apply ? await insertRows(target, schema, table, selected.rows) : 0;
      report.tables.push({ schema, table: table.name, sourceExists, targetExists, selected: selected.rowCount, inserted });
    }
  }
  if (apply) await target.query("commit");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (apply) await target.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
