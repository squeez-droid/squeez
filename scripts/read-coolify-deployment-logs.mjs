#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [deploymentUuid] = process.argv.slice(2);
if (!deploymentUuid) throw new Error("Usage: read-coolify-deployment-logs.mjs <deployment-uuid>");

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((raw) => {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) return [];
  const at = line.indexOf("=");
  return [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^("|')(.*)\1$/, "$2")]];
}));
const credentials = parseEnv(readFileSync(".env.testnet", "utf8"));
const base = credentials.COOLIFY_API_URL?.replace(/\/$/, "");
const token = credentials.COOLIFY_API_TOKEN;
if (!base || !token) throw new Error("Missing Coolify API credentials");

const response = await fetch(`${base}/api/v1/deployments/${encodeURIComponent(deploymentUuid)}`, {
  headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Coolify deployment request returned ${response.status}`);
const payload = await response.json();
let parsedLogs = payload.logs;
if (typeof parsedLogs === "string") {
  try { parsedLogs = JSON.parse(parsedLogs); } catch { parsedLogs = [{ output: parsedLogs }]; }
}
const entries = Array.isArray(parsedLogs) ? parsedLogs : [];
const output = entries.slice(-30).map((entry) => entry.output ?? entry.message ?? JSON.stringify(entry)).join("\n");
console.log(output
  .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s"']+/gi, "[URL_REDACTED]")
  .replace(/(authorization|token|password|secret)([=:]\s*)[^\s,;]+/gi, "$1$2[REDACTED]"));
