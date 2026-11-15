#!/usr/bin/env node
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";

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
const connect = process.argv.includes("--connect");
const targetOnly = process.argv.includes("--target-only");

const dataSchemas = [
  "testnet",
  "mainnet",
  "robinhood_testnet",
  "robinhood_mainnet",
  "hyperevm_testnet",
  "hyperevm_mainnet",
];
const systemSchemas = dataSchemas.map((schema) => `${schema}_system`)
  .map((schema) => schema.replace(/^testnet_system_system$/, "testnet_system").replace(/^mainnet_system_system$/, "mainnet_system"));
// Elysium keeps the legacy unprefixed schema names.
systemSchemas[0] = "testnet_system";
systemSchemas[1] = "mainnet_system";

const durableTables = ["identity_image_evidence", "x_creator_session", "x_attestation_usage"];
const rebuildableTables = [
  "token", "trade", "holder_balance", "creator_fee", "protocol_fee",
  "protected_purchase", "protection_tax", "identity", "burn",
];

function projectRef(value) {
  if (!value) return null;
  const url = new URL(value);
  const userRef = decodeURIComponent(url.username).split(".")[1];
  const hostRef = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
  return userRef ?? hostRef ?? url.hostname;
}

function safeConnection(value) {
  if (!value) return null;
  const url = new URL(value);
  return { host: url.hostname, database: url.pathname.slice(1), projectRef: projectRef(value) };
}

async function relationExists(client, schema, table) {
  const result = await client.query("select to_regclass($1) is not null as available", [`${schema}.${table}`]);
  return Boolean(result.rows[0]?.available);
}

async function inventory(client, label) {
  const report = { label, schemas: {}, durable: {}, rebuildable: {} };
  for (const schema of [...dataSchemas, ...systemSchemas]) {
    const result = await client.query(
      "select exists(select 1 from information_schema.schemata where schema_name=$1) as available",
      [schema],
    );
    report.schemas[schema] = Boolean(result.rows[0]?.available);
  }
  for (const schema of dataSchemas) {
    report.rebuildable[schema] = {};
    for (const table of rebuildableTables) {
      if (!await relationExists(client, schema, table)) {
        report.rebuildable[schema][table] = null;
        continue;
      }
      const result = await client.query(`select count(*)::bigint::text as count from "${schema}"."${table}"`);
      report.rebuildable[schema][table] = result.rows[0].count;
    }
  }
  for (const schema of systemSchemas) {
    report.durable[schema] = {};
    for (const table of durableTables) {
      if (!await relationExists(client, schema, table)) {
        report.durable[schema][table] = null;
        continue;
      }
      const result = await client.query(`select count(*)::bigint::text as count from "${schema}"."${table}"`);
      report.durable[schema][table] = result.rows[0].count;
    }
  }
  return report;
}

const plan = {
  mode: connect ? (targetOnly ? "read-only-target-inventory" : "read-only-inventory") : "offline-plan",
  source: safeConnection(sourceUrl),
  target: safeConnection(targetUrl),
  strategy: {
    onchain: "rebuild with each target indexer before cutover",
    durableOffchain: durableTables,
    excluded: ["x_oauth_request (short-lived)", "system_log older than 30 days"],
    cutover: "only after source/target counts and API responses pass",
  },
};

if (!connect) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
if ((!targetOnly && !sourceUrl) || !targetUrl) {
  throw new Error(targetOnly ? "TARGET_DATABASE_URL is required with --connect --target-only" : "SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required with --connect");
}
if (projectRef(sourceUrl) === projectRef(targetUrl)) throw new Error("Source and target resolve to the same project");

const target = new pg.Client({ connectionString: targetUrl, statement_timeout: 30_000 });
const source = targetOnly ? null : new pg.Client({ connectionString: sourceUrl, statement_timeout: 30_000 });
await Promise.all([source?.connect(), target.connect()]);
try {
  if (source) plan.sourceInventory = await inventory(source, "source");
  plan.targetInventory = await inventory(target, "target");
  console.log(JSON.stringify(plan, null, 2));
} finally {
  await Promise.allSettled([source?.end(), target.end()]);
}
