#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http } from "viem";

const [apiUuid, indexerUuid] = process.argv.slice(2);
if (!apiUuid || !indexerUuid) throw new Error("Usage: update-coolify-graduation-config.mjs <api-uuid> <indexer-uuid> --apply");
if (!process.argv.includes("--apply")) throw new Error("Refusing to update Coolify without --apply");
if (process.env.SQUEEZ_NETWORK !== "mainnet") throw new Error("Mainnet only");

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((raw) => {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) return [];
  const at = line.indexOf("=");
  return [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^("|')(.*)\1$/, "$2")]];
}));

const threshold = BigInt(required("GRADUATION_THRESHOLD_HYPE"));
const virtualReserve = BigInt(required("VIRTUAL_HYPE_RESERVE"));
if (virtualReserve !== threshold * 2n / 5n) throw new Error("Virtual reserve must equal 40% of threshold");

const factory = getAddress(required("FACTORY_ADDRESS"));
const abi = [
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchConfigs", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
    { type: "uint32" }, { type: "uint16" }, { type: "uint32" }, { type: "uint256" },
  ] },
];
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const activeId = await client.readContract({ address: factory, abi, functionName: "activeConfigId" });
const active = await client.readContract({ address: factory, abi, functionName: "launchConfigs", args: [activeId] });
if (active[0] !== threshold || active[1] !== virtualReserve) throw new Error("Root env does not match active on-chain launch config");

const credentials = parseEnv(readFileSync(".env.testnet", "utf8"));
const base = credentials.COOLIFY_API_URL?.replace(/\/$/, "");
const token = credentials.COOLIFY_API_TOKEN;
if (!base || !token) throw new Error("Coolify API credentials are missing");
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const prefix = required("SQUEEZ_CHAIN").toUpperCase();
const data = [
  { key: "GRADUATION_THRESHOLD_HYPE", value: threshold.toString(), is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  { key: "VIRTUAL_HYPE_RESERVE", value: virtualReserve.toString(), is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  { key: `${prefix}_GRADUATION_THRESHOLD_HYPE`, value: threshold.toString(), is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  { key: `${prefix}_VIRTUAL_HYPE_RESERVE`, value: virtualReserve.toString(), is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
];
const update = async (uuid) => {
  const response = await fetch(`${base}/api/v1/applications/${uuid}/envs/bulk`, {
    method: "PATCH", headers, body: JSON.stringify({ data }), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Coolify env update failed for ${uuid} (${response.status}): ${await response.text()}`);

  const verifyResponse = await fetch(`${base}/api/v1/applications/${uuid}/envs`, {
    headers, signal: AbortSignal.timeout(20_000),
  });
  if (!verifyResponse.ok) throw new Error(`Coolify env verification failed for ${uuid} (${verifyResponse.status})`);
  const payload = await verifyResponse.json();
  const rows = Array.isArray(payload) ? payload : (payload.data ?? []);
  for (const [key, expected] of [
    ["GRADUATION_THRESHOLD_HYPE", threshold.toString()], ["VIRTUAL_HYPE_RESERVE", virtualReserve.toString()],
    [`${prefix}_GRADUATION_THRESHOLD_HYPE`, threshold.toString()], [`${prefix}_VIRTUAL_HYPE_RESERVE`, virtualReserve.toString()],
  ]) {
    const matches = rows.filter((row) => row.key === key && row.is_preview !== true);
    if (matches.length !== 1 || String(matches[0].value) !== expected) {
      throw new Error(`Coolify env verification failed for ${uuid}:${key}; found ${matches.length} production entries`);
    }
  }
  return rows.filter((row) => data.some((variable) => variable.key === row.key) && row.is_preview !== true).map((row) => ({
    key: row.key, value: row.value, isBuildtime: row.is_buildtime, isRuntime: row.is_runtime,
  }));
};
const [apiVariables, indexerVariables] = await Promise.all([update(apiUuid), update(indexerUuid)]);
console.log(JSON.stringify({
  chain: process.env.SQUEEZ_CHAIN, activeConfigId: activeId.toString(),
  graduationThresholdHype: threshold.toString(), virtualHypeReserve: virtualReserve.toString(),
  updated: { apiUuid, indexerUuid },
  variables: { api: apiVariables, indexer: indexerVariables },
}, null, 2));
