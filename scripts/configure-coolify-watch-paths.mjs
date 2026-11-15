#!/usr/bin/env node
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
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

const headers = { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" };
const request = async (path, init = {}) => {
  const response = await fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) : {};
};
const rows = (payload) => Array.isArray(payload) ? payload : payload.data ?? [];
const paths = (...values) => values.flat().join("\n");
const common = ["Dockerfile.backend", "package-lock.json", "scripts/start-backend-service.mjs"];

function desiredWatchPaths(name) {
  if (name === "squeez-api-gateway") {
    return paths(common, "apps/gateway/**");
  }
  const api = name.match(/^squeez-api-(elysium|hyperevm|robinhood)-(testnet|mainnet)$/);
  if (api) {
    return paths(common, "apps/backend/**", "packages/shared/**", `packages/contracts/deployments/${api[1]}/**`);
  }
  const indexer = name.match(/^squeez-indexer-(elysium|hyperevm|robinhood)-(testnet|mainnet)$/);
  if (indexer) {
    return paths(common, "apps/indexer/**", "packages/shared/**", `packages/contracts/deployments/${indexer[1]}/**`);
  }
  // Legacy Elysium testnet indexer retained during the target-resource migration.
  if (name === "squeez-indexer") {
    return paths(common, "apps/indexer/**", "packages/shared/**", "packages/contracts/deployments/elysium/**");
  }
  if (name === "squeez-keeper") {
    return paths(common, "apps/keeper/**", "packages/shared/**", "packages/contracts/deployments/**");
  }
  return null;
}

const applications = rows(await request("/api/v1/applications"));
const result = [];
for (const application of applications) {
  const desired = desiredWatchPaths(application.name);
  if (!desired) continue;
  const detail = await request(`/api/v1/applications/${application.uuid}`);
  const current = (detail.watch_paths ?? "").trim();
  if (current === desired) {
    result.push({ name: application.name, uuid: application.uuid, changed: false, applied: false });
    continue;
  }
  if (apply) {
    await request(`/api/v1/applications/${application.uuid}`, {
      method: "PATCH",
      body: JSON.stringify({ watch_paths: desired }),
    });
    const verified = await request(`/api/v1/applications/${application.uuid}`);
    if ((verified.watch_paths ?? "").trim() !== desired) throw new Error(`Watch path verification failed for ${application.name}`);
  }
  result.push({
    name: application.name,
    uuid: application.uuid,
    changed: true,
    applied: apply,
    previousPathCount: current ? current.split(/\r?\n/).length : 0,
    desiredPathCount: desired.split("\n").length,
  });
}

if (!result.some((entry) => entry.name === "squeez-api-gateway")) {
  throw new Error("Gateway application was not found; refusing partial watch-path configuration");
}
console.log(JSON.stringify({ apply, applications: result }, null, 2));
