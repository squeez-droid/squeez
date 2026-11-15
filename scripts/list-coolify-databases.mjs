#!/usr/bin/env node
import { readFileSync } from "node:fs";

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
const response = await fetch(`${base}/api/v1/databases`, {
  headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`Coolify databases request returned ${response.status}: ${await response.text()}`);
const payload = await response.json();
const rows = Array.isArray(payload) ? payload : (payload.data ?? []);
console.log(JSON.stringify(rows.map((database) => ({
  uuid: database.uuid,
  name: database.name,
  type: database.type,
  status: database.status,
  destination: database.destination?.name ?? null,
  internalDbUrl: database.internal_db_url ? new URL(database.internal_db_url).hostname : null,
  publicPort: database.public_port ?? null,
})), null, 2));

const safeDatabaseTarget = (value) => {
  try {
    const parsed = new URL(value);
    return { hostname: parsed.hostname, port: parsed.port || "5432", database: parsed.pathname.replace(/^\//, "") };
  } catch { return { hostname: null, port: null, database: null }; }
};
const local = parseEnv(readFileSync(".env.testnet", "utf8"));
const applicationIds = [
  "smjkwvu1w5af3pl8cnvclqnk", "tudsmwkucnr5gqxjfzfjem8w", "vaj0rbbgisos620yuwt3x2zb",
  "sxdaqz6uqefmdrlvl5intdss", "wvqcmtnnnqxwbj2gf6uaolud", "vx55acryjhdxly1sdkpzsfsp",
];
const applicationTargets = [];
for (const uuid of applicationIds) {
  const envResponse = await fetch(`${base}/api/v1/applications/${uuid}/envs`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(20_000),
  });
  if (!envResponse.ok) throw new Error(`Coolify env request returned ${envResponse.status} for ${uuid}`);
  const envPayload = await envResponse.json();
  const envRows = Array.isArray(envPayload) ? envPayload : (envPayload.data ?? []);
  const databaseUrl = envRows.find((row) => row.key === "DATABASE_URL" && row.is_preview !== true);
  applicationTargets.push({ uuid, ...safeDatabaseTarget(databaseUrl?.real_value ?? databaseUrl?.value ?? "") });
}
console.log(JSON.stringify({ local: safeDatabaseTarget(local.DATABASE_URL ?? ""), applications: applicationTargets }, null, 2));
