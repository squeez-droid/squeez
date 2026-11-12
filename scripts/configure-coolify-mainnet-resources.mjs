#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [apiUuid, indexerUuid] = process.argv.slice(2);
if (!apiUuid || !indexerUuid) throw new Error("Usage: configure-coolify-mainnet-resources.mjs <api-uuid> <indexer-uuid>");
if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("Run through tools/with-env.mjs robinhood mainnet");
}

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((raw) => {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) return [];
  const at = line.indexOf("=");
  return [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^(\"|')(.*)\1$/, "$2")]];
}));
const local = parseEnv(readFileSync(".env.testnet", "utf8"));
const base = local.COOLIFY_API_URL?.replace(/\/$/, "");
const token = local.COOLIFY_API_TOKEN;
if (!base || !token) throw new Error("COOLIFY_API_URL and COOLIFY_API_TOKEN are required in .env.testnet");

const sharedKeys = [
  "SQUEEZ_CHAIN", "SQUEEZ_NETWORK", "SQUEEZ_CHAIN_ID", "SQUEEZ_RPC", "SQUEEZ_RPC_FALLBACK", "SQUEEZ_EXPLORER",
  "DATABASE_URL", "DATABASE_SCHEMA", "CROSS_CHAIN_DATABASE_SCHEMA", "FACTORY_ADDRESS", "FACTORY_START_BLOCK",
  "QUOTE_REGISTRY_ADDRESS", "PROTECTION_POLICY_REGISTRY_ADDRESS", "IDENTITY_REGISTRY_ADDRESS", "FEE_VAULT_ADDRESS",
  "CURVE_BEACON_ADDRESS", "SQUEEZ_HOOK_ADDRESS", "LIQUIDITY_LOCKER_ADDRESS", "GRADUATION_ADAPTER_ADDRESS",
  "SWAP_ROUTER_ADDRESS", "SWAP_ROUTER_START_BLOCK", "V4_POOL_MANAGER_ADDRESS", "V4_POSITION_MANAGER_ADDRESS",
  "V4_PERMIT2_ADDRESS", "V4_UNIVERSAL_ROUTER_ADDRESS", "V4_STATE_VIEW_ADDRESS", "V4_QUOTER_ADDRESS",
  "WRAPPED_NATIVE_ADDRESS", "GRADUATION_THRESHOLD_HYPE", "VIRTUAL_HYPE_RESERVE", "VIRTUAL_TOKEN_RESERVE",
  "SNIPER_TAX_START_BPS", "SNIPER_TAX_DECAY_SECONDS", "MAX_BUY_BPS_PER_TRANSACTION", "MAX_WALLET_BPS",
  "MAX_WALLET_WINDOW_SECONDS", "LAUNCH_FEE_HYPE", "TICKER_LOCK_SECONDS", "INDEXER_MAX_REQUESTS_PER_SECOND",
  "INDEXER_LOG_BLOCK_RANGE", "INDEXER_START_BLOCK", "INDEXER_RPC", "ALLOWED_ORIGINS", "PUBLIC_API_URL",
  "SQUEEZ_RELEASE_MODE", "SQUEEZ_COMMUNITY_TESTING_ENABLED", "SQUEEZ_COMMUNITY_MAX_OPENING_BUY_WEI",
  "SQUEEZ_RISK_ACK_VERSION",
];
const secretKeys = new Set(["SQUEEZ_RPC", "SQUEEZ_RPC_FALLBACK", "INDEXER_RPC", "DATABASE_URL"]);
const dataFor = (service) => [
  ...sharedKeys.flatMap((key) => process.env[key] ? [{
    key, value: process.env[key], is_preview: false, is_literal: true, is_multiline: false,
    is_shown_once: secretKeys.has(key),
  }] : []),
  { key: "SQUEEZ_SERVICE", value: service, is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  { key: "PORT", value: "3000", is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  ...(service === "indexer" && process.env.PONDER_EXPERIMENTAL_DB ? [{
    key: "PONDER_EXPERIMENTAL_DB", value: process.env.PONDER_EXPERIMENTAL_DB,
    is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false,
  }] : []),
  { key: "VIRTUAL_HYPE_RESERVE", value: (BigInt(process.env.GRADUATION_THRESHOLD_HYPE) * 2n / 5n).toString(), is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  { key: "X_OAUTH_ENABLED", value: "false", is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  ...(service === "api" ? [{ key: "SQUEEZ_API_CAPABILITY", value: "read-only", is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false }] : []),
];

const update = async (uuid, service) => {
  const response = await fetch(`${base}/api/v1/applications/${uuid}/envs/bulk`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ data: dataFor(service) }),
  });
  if (!response.ok) throw new Error(`${service} env update failed (${response.status}): ${await response.text()}`);
  return { uuid, service, variablesUpdated: dataFor(service).length };
};

console.log(JSON.stringify(await Promise.all([update(apiUuid, "api"), update(indexerUuid, "indexer")]), null, 2));
