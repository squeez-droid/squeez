#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";

const chain = process.env.SQUEEZ_CHAIN;
if (!["elysium", "hyperevm", "robinhood"].includes(chain) || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("Coolify mainnet check must run through a supported mainnet env loader");
}

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((raw) => {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) return [];
  const at = line.indexOf("=");
  return [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^("|')(.*)\1$/, "$2")]];
}));
const credentials = parseEnv(readFileSync(".env.testnet", "utf8"));
const base = credentials.COOLIFY_API_URL?.replace(/\/$/, "");
const token = credentials.COOLIFY_API_TOKEN;
if (!base || !token) throw new Error("COOLIFY_API_URL and COOLIFY_API_TOKEN are required in .env.testnet");
const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
const request = async (path) => {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Coolify ${path} returned ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 5) await wait(attempt * 2_000);
    }
  }
  throw lastError;
};

const applicationsPayload = await request("/api/v1/applications");
const applications = Array.isArray(applicationsPayload) ? applicationsPayload : applicationsPayload.data ?? [];
const byName = (name) => applications.find((application) => application.name === name);
const api = byName(`squeez-api-${chain}-mainnet`);
const indexer = byName(`squeez-indexer-${chain}-mainnet`);
if (!api || !indexer) throw new Error(`${chain} mainnet API/indexer resources are missing`);

const envPayload = await request(`/api/v1/applications/${indexer.uuid}/envs`);
const rows = Array.isArray(envPayload) ? envPayload : envPayload.data ?? [];
const expected = {
  SQUEEZ_SERVICE: "indexer",
  SQUEEZ_CHAIN: chain,
  SQUEEZ_NETWORK: "mainnet",
  SQUEEZ_CHAIN_ID: process.env.SQUEEZ_CHAIN_ID,
  SQUEEZ_RPC: process.env.SQUEEZ_RPC,
  SQUEEZ_RPC_FALLBACK: process.env.SQUEEZ_RPC_FALLBACK,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_SCHEMA: process.env.DATABASE_SCHEMA,
  FACTORY_ADDRESS: process.env.FACTORY_ADDRESS,
  FACTORY_START_BLOCK: process.env.FACTORY_START_BLOCK,
  SWAP_ROUTER_ADDRESS: process.env.SWAP_ROUTER_ADDRESS,
  SWAP_ROUTER_START_BLOCK: process.env.SWAP_ROUTER_START_BLOCK,
};
const secretKeys = new Set(["SQUEEZ_RPC", "SQUEEZ_RPC_FALLBACK", "DATABASE_URL"]);
const configuration = Object.entries(expected).filter(([, value]) => value).map(([key, value]) => {
  const production = rows.filter((row) => row.key === key && !row.is_preview);
  const hiddenSecret = secretKeys.has(key) && production.length === 1 && production[0].is_shown_once;
  return {
    key,
    productionEntries: production.length,
    present: hiddenSecret || production.some((row) => String(row.value ?? "").length > 0),
    matchesRoot: hiddenSecret ? null : production.some((row) => String(row.value ?? "") === String(value ?? "")),
    secretValueHidden: hiddenSecret,
  };
});
const invalid = configuration.filter((entry) => entry.productionEntries !== 1 || !entry.present
  || entry.matchesRoot === false);
const status = (application) => ({
  uuid: application.uuid,
  name: application.name,
  status: application.status,
  healthy: application.status === "running:healthy",
  commit: application.git_commit_sha ?? null,
});
const result = {
  ready: status(api).healthy && status(indexer).healthy && invalid.length === 0,
  api: status(api),
  indexer: status(indexer),
  configurationMatchesRoot: invalid.length === 0,
  invalidConfiguration: invalid,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 1;
