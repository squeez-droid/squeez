#!/usr/bin/env node

import { readFileSync } from "node:fs";

const uuids = process.argv.slice(2).filter(Boolean);
if (!uuids.length) throw new Error("Usage: deploy-coolify-applications.mjs <application-uuid> [...uuid]");

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
for (const uuid of uuids) {
  const url = new URL(`${base}/api/v1/deploy`);
  url.searchParams.set("uuid", uuid);
  url.searchParams.set("force", "false");
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Deploy ${uuid} failed (${response.status}): ${text}`);
  const body = text ? JSON.parse(text) : {};
  results.push({ applicationUuid: uuid, deploymentUuid: body.deployment_uuid ?? body.uuid ?? null, queued: true });
}

console.log(JSON.stringify(results, null, 2));
