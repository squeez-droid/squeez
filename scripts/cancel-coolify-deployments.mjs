#!/usr/bin/env node

import { readFileSync } from "node:fs";

const deploymentUuids = process.argv.slice(2).filter(Boolean);
if (!deploymentUuids.length) throw new Error("Usage: cancel-coolify-deployments.mjs <deployment-uuid> [...uuid]");
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

const results = [];
for (const uuid of deploymentUuids) {
  const response = await fetch(`${base}/api/v1/deployments/${encodeURIComponent(uuid)}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Cancel ${uuid} failed (${response.status}): ${text}`);
  results.push({ deploymentUuid: uuid, cancelled: true });
}
console.log(JSON.stringify(results, null, 2));
