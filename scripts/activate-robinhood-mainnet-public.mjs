#!/usr/bin/env node

import { readFileSync } from "node:fs";
import pg from "pg";

if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("Public activation is restricted to Robinhood mainnet");
}

const apply = process.argv.includes("--apply");
const apiUuid = process.env.ROBINHOOD_MAINNET_API_COOLIFY_UUID || "smjkwvu1w5af3pl8cnvclqnk";
const gatewayUuid = process.env.SQUEEZ_GATEWAY_COOLIFY_UUID || "6gbp4luvz1trfylqqkwrpcmt";
const maxLagBlocks = Number(process.env.INDEXER_MAX_LAG_BLOCKS || "2000");
const staleSeconds = Number(process.env.INDEXER_STALE_SECONDS || "300");
const maxOpeningBuyWei = process.env.SQUEEZ_COMMUNITY_MAX_OPENING_BUY_WEI || "1000000000000000";
const acknowledgementVersion = process.env.SQUEEZ_RISK_ACK_VERSION || "robinhood-mainnet-canary-v1";

const rpcResponse = await fetch(process.env.SQUEEZ_RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  signal: AbortSignal.timeout(15_000),
});
if (!rpcResponse.ok) throw new Error(`RPC head request failed (${rpcResponse.status})`);
const rpcPayload = await rpcResponse.json();
if (rpcPayload.error || !rpcPayload.result) throw new Error("RPC head request returned an error");
const rpcHead = BigInt(rpcPayload.result);

const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
let state;
try {
  const result = await database.query(`select
      substring(latest_checkpoint from 27 for 16)::bigint as "blockNumber",
      (select (value->>'heartbeat_at')::bigint / 1000 from "robinhood_mainnet"._ponder_meta
        where key = 'app' limit 1) as "heartbeatAt"
    from "robinhood_mainnet"._ponder_checkpoint where chain_id = 4663 limit 1`);
  state = result.rows[0];
} finally {
  await database.end();
}
if (!state) throw new Error("Robinhood mainnet indexer checkpoint is missing");
const checkpoint = BigInt(state.blockNumber);
const lagBlocks = Number(rpcHead - checkpoint);
const heartbeatAgeSeconds = Math.max(0, Math.floor(Date.now() / 1_000) - Number(state.heartbeatAt));
const blockers = [
  ...(lagBlocks > maxLagBlocks ? [`indexer lag ${lagBlocks} exceeds ${maxLagBlocks}`] : []),
  ...(heartbeatAgeSeconds > staleSeconds ? [`indexer heartbeat age ${heartbeatAgeSeconds}s exceeds ${staleSeconds}s`] : []),
];

const result = {
  target: "robinhood:mainnet",
  applyRequested: apply,
  eligible: blockers.length === 0,
  rpcHead: rpcHead.toString(),
  checkpoint: checkpoint.toString(),
  lagBlocks,
  heartbeatAgeSeconds,
  release: {
    apiCapability: "enabled",
    gatewayCapability: "enabled",
    mode: "community-canary",
    communityTestingEnabled: true,
    maxOpeningBuyWei,
    acknowledgementVersion,
  },
  blockers,
};

if (!apply || blockers.length > 0) {
  console.log(JSON.stringify(result, null, 2));
  if (apply && blockers.length > 0) process.exitCode = 2;
} else {
  const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) return [];
    const at = line.indexOf("=");
    return [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^("|')(.*)\1$/, "$2")]];
  }));
  const credentials = parseEnv(readFileSync(".env.testnet", "utf8"));
  const base = credentials.COOLIFY_API_URL?.replace(/\/$/, "");
  const token = credentials.COOLIFY_API_TOKEN;
  if (!base || !token) throw new Error("Coolify API credentials are missing");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const variable = (key, value) => ({
    key, value, is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false,
  });
  const update = async (uuid, data) => {
    const response = await fetch(`${base}/api/v1/applications/${uuid}/envs/bulk`, {
      method: "PATCH", headers, body: JSON.stringify({ data }), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Coolify env update failed for ${uuid} (${response.status})`);
  };
  await update(apiUuid, [
    variable("SQUEEZ_API_CAPABILITY", "enabled"),
    variable("SQUEEZ_RELEASE_MODE", "community-canary"),
    variable("SQUEEZ_COMMUNITY_TESTING_ENABLED", "true"),
    variable("SQUEEZ_COMMUNITY_MAX_OPENING_BUY_WEI", maxOpeningBuyWei),
    variable("SQUEEZ_RISK_ACK_VERSION", acknowledgementVersion),
  ]);
  await update(gatewayUuid, [variable("ROBINHOOD_MAINNET_CAPABILITY", "enabled")]);
  console.log(JSON.stringify({ ...result, applied: true, resources: { apiUuid, gatewayUuid } }, null, 2));
}
