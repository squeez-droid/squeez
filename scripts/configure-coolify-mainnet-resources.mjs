#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [apiUuid, indexerUuid] = process.argv.slice(2);
if (!apiUuid || !indexerUuid) throw new Error("Usage: configure-coolify-mainnet-resources.mjs <api-uuid> <indexer-uuid>");
const indexerOnly = process.argv.includes("--indexer-only");
const apiDatabaseOnly = process.argv.includes("--api-database-only");
const apiOAuthOnly = process.argv.includes("--api-oauth-only");
if ([indexerOnly, apiDatabaseOnly, apiOAuthOnly].filter(Boolean).length > 1) {
  throw new Error("Choose only one scoped update mode");
}
if (!["elysium", "robinhood", "hyperevm"].includes(process.env.SQUEEZ_CHAIN) || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("Run through tools/with-env.mjs <elysium|robinhood|hyperevm> mainnet");
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
  "PERMIT2", "UNIVERSAL_ROUTER",
  "WRAPPED_NATIVE_ADDRESS", "GRADUATION_THRESHOLD_HYPE", "VIRTUAL_HYPE_RESERVE", "VIRTUAL_TOKEN_RESERVE",
  "SNIPER_TAX_START_BPS", "SNIPER_TAX_DECAY_SECONDS", "MAX_BUY_BPS_PER_TRANSACTION", "MAX_WALLET_BPS",
  "MAX_WALLET_WINDOW_SECONDS", "LAUNCH_FEE_HYPE", "TICKER_LOCK_SECONDS", "INDEXER_MAX_REQUESTS_PER_SECOND",
  "INDEXER_LOG_BLOCK_RANGE", "INDEXER_START_BLOCK", "INDEXER_RPC", "INDEXER_MAX_LAG_BLOCKS",
  "INDEXER_STALE_SECONDS", "ALLOWED_ORIGINS", "PUBLIC_API_URL",
  "SQUEEZ_RELEASE_MODE", "SQUEEZ_COMMUNITY_TESTING_ENABLED", "SQUEEZ_COMMUNITY_MAX_OPENING_BUY_WEI",
  "SQUEEZ_RISK_ACK_VERSION",
];
const secretKeys = new Set(["SQUEEZ_RPC", "SQUEEZ_RPC_FALLBACK", "INDEXER_RPC", "DATABASE_URL"]);
const apiOnlyKeys = ["X_OAUTH_ENABLED", "X_ATTESTATION_REQUIRED", "X_REDIRECT_URI", "X_MAX_ATTESTED_LAUNCHES_PER_24H"];
const apiOnlySecretKeys = ["PINATA_JWT", "X_CLIENT_ID", "X_CLIENT_SECRET", "SQUEEZ_ATTESTER_PRIVATE_KEY"];
const databaseUrlFor = (service) => {
  if (service !== "api" || !process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL);
  // Hosted APIs use Supabase's transaction pooler so multiple chain/network services do not consume the
  // small session-pool quota. Ponder indexers retain session mode because they own long-running checkpoints.
  if (url.hostname.endsWith(".pooler.supabase.com") && (url.port === "" || url.port === "5432")) url.port = "6543";
  return url.toString();
};
const dataFor = (service) => [
  ...sharedKeys.flatMap((key) => {
    const value = key === "DATABASE_URL" ? databaseUrlFor(service) : process.env[key];
    return value ? [{
      key, value, is_preview: false, is_literal: true, is_multiline: false,
      is_shown_once: secretKeys.has(key),
    }] : [];
  }),
  { key: "SQUEEZ_SERVICE", value: service, is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  { key: "PORT", value: "3000", is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  ...(service === "api" ? apiOnlyKeys.flatMap((key) => process.env[key] ? [{
    key, value: process.env[key], is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false,
  }] : []) : []),
  ...(service === "api" ? apiOnlySecretKeys.flatMap((key) => process.env[key] ? [{
    key, value: process.env[key], is_preview: false, is_literal: true, is_multiline: false, is_shown_once: true,
  }] : []) : []),
  ...(service === "indexer" && process.env.PONDER_EXPERIMENTAL_DB ? [{
    key: "PONDER_EXPERIMENTAL_DB", value: process.env.PONDER_EXPERIMENTAL_DB,
    is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false,
  }] : []),
  { key: "VIRTUAL_HYPE_RESERVE", value: (BigInt(process.env.GRADUATION_THRESHOLD_HYPE) * 2n / 5n).toString(), is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false },
  ...(service === "api" ? [{ key: "SQUEEZ_API_CAPABILITY", value: process.env.SQUEEZ_API_CAPABILITY ?? "read-only", is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false }] : []),
];

const update = async (uuid, service) => {
  const data = apiOAuthOnly && service === "api"
    ? [
        ...apiOnlyKeys.flatMap((key) => process.env[key] ? [{
          key, value: process.env[key], is_preview: false, is_literal: true,
          is_multiline: false, is_shown_once: false,
        }] : []),
        ...apiOnlySecretKeys.flatMap((key) => process.env[key] ? [{
          key, value: process.env[key], is_preview: false, is_literal: true,
          is_multiline: false, is_shown_once: true,
        }] : []),
      ]
    : apiDatabaseOnly && service === "api"
      ? [{ key: "DATABASE_URL", value: databaseUrlFor("api"), is_preview: false, is_literal: true,
          is_multiline: false, is_shown_once: true }]
      : dataFor(service);
  const response = await fetch(`${base}/api/v1/applications/${uuid}/envs/bulk`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) throw new Error(`${service} env update failed (${response.status}): ${await response.text()}`);
  return { uuid, service, variablesUpdated: data.length };
};

console.log(JSON.stringify(await Promise.all(indexerOnly
  ? [update(indexerUuid, "indexer")]
  : apiDatabaseOnly || apiOAuthOnly
    ? [update(apiUuid, "api")]
    : [update(apiUuid, "api"), update(indexerUuid, "indexer")]), null, 2));
