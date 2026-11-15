#!/usr/bin/env node
import { readFileSync } from "node:fs";

const uuids = process.argv.slice(2).filter(Boolean);
if (!uuids.length) throw new Error("Usage: restart-coolify-applications.mjs <application-uuid> [...uuid]");

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((raw) => {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) return [];
  const at = line.indexOf("=");
  return [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^(\"|')(.*)\1$/, "$2")]];
}));
const credentials = parseEnv(readFileSync(".env.testnet", "utf8"));
const base = credentials.COOLIFY_API_URL?.replace(/\/$/, "");
const token = credentials.COOLIFY_API_TOKEN;
if (!base || !token) throw new Error("Coolify API credentials are missing");

const results = [];
for (const uuid of uuids) {
  const response = await fetch(`${base}/api/v1/applications/${encodeURIComponent(uuid)}/restart`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Coolify restart failed for ${uuid} (${response.status}): ${await response.text()}`);
  results.push({ applicationUuid: uuid, restarted: true });
}
console.log(JSON.stringify(results, null, 2));
