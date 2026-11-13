#!/usr/bin/env node

import pg from "pg";
import { createPublicClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { operationalDatabaseUrl } from "./lib/database-url.mjs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const operationalSchema = ({ chain, stage }) => chain === "elysium"
  ? `${stage}_system`
  : `${chain}_${stage}_system`;
if (!['elysium', 'hyperevm', 'robinhood'].includes(required("SQUEEZ_CHAIN"))) {
  throw new Error("Unsupported SQUEEZ_CHAIN");
}
if (!['testnet', 'mainnet'].includes(required("SQUEEZ_NETWORK"))) {
  throw new Error("Unsupported SQUEEZ_NETWORK");
}

const apiBase = required("PUBLIC_API_URL").replace(/\/$/, "")
  + `/v1/${process.env.SQUEEZ_CHAIN}/${process.env.SQUEEZ_NETWORK}`;
const expectedRedirect = `${apiBase}/auth/x/callback`;
const factory = getAddress(required("FACTORY_ADDRESS"));
const signer = privateKeyToAccount(required("SQUEEZ_ATTESTER_PRIVATE_KEY"));
const rpc = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const factoryAbi = [
  { type: "function", name: "attester", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

const [configResponse, onchainAttester] = await Promise.all([
  fetch(`${apiBase}/config`, { signal: AbortSignal.timeout(10_000) }),
  rpc.readContract({ address: factory, abi: factoryAbi, functionName: "attester" }),
]);
const config = configResponse.ok ? await configResponse.json() : null;
const database = new pg.Pool({
  connectionString: operationalDatabaseUrl(required("DATABASE_URL")),
  max: 1,
  connectionTimeoutMillis: 10_000,
});
let tables;
try {
  const schema = operationalSchema({ chain: process.env.SQUEEZ_CHAIN, stage: process.env.SQUEEZ_NETWORK });
  tables = await database.query(
    "select to_regclass($1) is not null as oauth, to_regclass($2) is not null as session, to_regclass($3) is not null as usage",
    [`${schema}.x_oauth_request`, `${schema}.x_creator_session`, `${schema}.x_attestation_usage`],
  );
} finally {
  await database.end();
}

const checks = {
  apiHealthy: configResponse.ok,
  oauthEnabled: config?.creatorAttestation?.enabled === true,
  signerConfigured: config?.creatorAttestation?.configured === true,
  mandatoryStillDisabled: config?.creatorAttestation?.required !== true,
  redirectMatchesTarget: required("X_REDIRECT_URI") === expectedRedirect,
  attesterMatchesSigner: getAddress(onchainAttester) === signer.address,
  oauthTablesReady: Boolean(tables.rows[0]?.oauth && tables.rows[0]?.session && tables.rows[0]?.usage),
};
const ready = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  ready,
  target: `${process.env.SQUEEZ_CHAIN}:${process.env.SQUEEZ_NETWORK}`,
  apiBase,
  factory,
  attester: getAddress(onchainAttester),
  checks,
}, null, 2));
if (!ready) process.exitCode = 1;
