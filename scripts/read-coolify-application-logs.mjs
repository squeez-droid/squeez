#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [applicationUuid, requestedLines = "200", outputMode = "full"] = process.argv.slice(2);
if (!applicationUuid) {
  throw new Error("Usage: read-coolify-application-logs.mjs <application-uuid> [lines]");
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
if (!base || !token) {
  throw new Error("COOLIFY_API_URL and COOLIFY_API_TOKEN are required in .env.testnet");
}

const lines = Math.min(Math.max(Number.parseInt(requestedLines, 10) || 200, 1), 1_000);
const response = await fetch(`${base}/api/v1/applications/${encodeURIComponent(applicationUuid)}/logs?lines=${lines}`, {
  headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Coolify logs request returned ${response.status}`);

const payload = await response.json();
const rawLogs = typeof payload === "string"
  ? payload
  : payload.logs ?? payload.data ?? payload.message ?? JSON.stringify(payload);
const sanitized = String(rawLogs)
  .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s"']+/gi, "[URL_REDACTED]")
  .replace(/(authorization|token|password|secret)([=:]\s*)[^\s,;]+/gi, "$1$2[REDACTED]");

if (outputMode === "--summary") {
  const relevant = sanitized.split(/\r?\n/).filter((line) =>
    /Connected to JSON-RPC|Updated backfill|alchemy|pinax|Free tier|429|MigrationError|\bERROR\b/i.test(line)
  );
  console.log(relevant.slice(-40).join("\n") || "No matching RPC, backfill, or error lines found.");
} else {
  console.log(sanitized);
}
