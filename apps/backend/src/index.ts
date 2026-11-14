import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, formatEther, getAddress, keccak256, toBytes, verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import sharp from "sharp";
import {
  LOG_EVENTS, SQUEEZ_NETWORKS, WEB_LOG_EVENTS, deploymentSchema, operationalSchema,
  type DeploymentTarget, type LogEvent,
} from "@squeez/shared";
import { backendConfig as config } from "./config.js";
import { writeSystemLog } from "./logger.js";
import { pinLaunchMetadata } from "./pinata.js";
import { computeImageEvidence } from "./image-evidence.js";
import { resolveTargetRoute } from "./target-routing.js";

const databasePoolMax = Number(process.env.DATABASE_POOL_MAX?.trim() || "2");
if (!Number.isSafeInteger(databasePoolMax) || databasePoolMax < 1) {
  throw new Error("DATABASE_POOL_MAX must be a positive integer");
}
const pool = new Pool({ connectionString: config.databaseUrl, max: databasePoolMax });
const safeRpcMethods = new Set([
  "eth_blockNumber", "eth_call", "eth_chainId", "eth_estimateGas", "eth_feeHistory", "eth_gasPrice",
  "eth_getBalance", "eth_getBlockByHash", "eth_getBlockByNumber", "eth_getCode", "eth_getLogs",
  "eth_getTransactionByHash", "eth_getTransactionCount", "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas",
]);

function cors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
  // Browsers preflight non-simple requests (for example a JSON content-type) with OPTIONS before the GET.
  const publicDiscoveryRoute = (req.method === "GET" || req.method === "OPTIONS") && (
    /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/token-?list\.json$/.test(pathname)
    || /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/tokens\/0x[a-fA-F0-9]{40}\/logo$/.test(pathname)
    || /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/integrations\/launchpad\.json$/.test(pathname)
    || /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/tokens\/0x[a-fA-F0-9]{40}\/(?:route|quote|pool)$/.test(pathname)
    || /^\/v1\/token-?list\.json$/.test(pathname)
    || /^\/v1\/tokens\/0x[a-fA-F0-9]{40}\/logo$/.test(pathname)
    || /^\/v1\/integrations\/launchpad\.json$/.test(pathname)
    || /^\/v1\/tokens\/0x[a-fA-F0-9]{40}\/(?:route|quote|pool)$/.test(pathname)
  );
  if (publicDiscoveryRoute) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,x-request-id");
    res.setHeader("access-control-max-age", "86400");
    return true;
  }
  if (origin && !config.allowedOrigins.has(origin)) {
    res.writeHead(403).end("Origin not allowed");
    return false;
  }
  if (origin) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("access-control-allow-credentials", "true");
  return true;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function publicJson(res: ServerResponse, status: number, body: unknown, maxAge = 300) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=600`,
  });
  res.end(JSON.stringify(body));
}

function chainQualified<T extends Record<string, unknown>>(row: T): T & { chainId: number } {
  return { chainId: config.chainId, ...row };
}

async function body(req: IncomingMessage, maxBytes = 128_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const uploadNonces = new Map<string, { nonce: string; expiresAt: number; requestId: string }>();
const xAuthNonces = new Map<string, { nonce: string; expiresAt: number }>();
const imageTypes = new Map([
  ["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"],
]);
const quoteRegistryAbi = [{
  type: "function", name: "getActiveQuotes", stateMutability: "view", inputs: [],
  outputs: [{ name: "active", type: "tuple[]", components: [
    { name: "asset", type: "address" }, { name: "decimals", type: "uint8" },
    { name: "routerPath", type: "bytes" }, { name: "active", type: "bool" },
  ] }],
}] as const;
const externalCurveAbi = [
  {
    type: "function", name: "quoteBuy", stateMutability: "view",
    inputs: [{ name: "hypeIn", type: "uint256" }],
    outputs: [
      { name: "tokensOut", type: "uint256" }, { name: "protocolFee", type: "uint256" },
      { name: "creatorFee", type: "uint256" }, { name: "sniperTax", type: "uint256" },
    ],
  },
  {
    type: "function", name: "quoteSell", stateMutability: "view",
    inputs: [{ name: "tokenAmount", type: "uint256" }],
    outputs: [
      { name: "hypeOut", type: "uint256" }, { name: "protocolFee", type: "uint256" },
      { name: "creatorFee", type: "uint256" },
    ],
  },
  {
    type: "function", name: "buy", stateMutability: "payable",
    inputs: [{ name: "minTokensOut", type: "uint256" }, { name: "deadline", type: "uint256" }],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function", name: "sell", stateMutability: "nonpayable",
    inputs: [
      { name: "tokenAmount", type: "uint256" }, { name: "minHypeOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "hypeOut", type: "uint256" }],
  },
  {
    type: "function", name: "buyTo", stateMutability: "payable",
    inputs: [
      { name: "recipient", type: "address" }, { name: "minTokensOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function", name: "sellTo", stateMutability: "nonpayable",
    inputs: [
      { name: "tokenAmount", type: "uint256" }, { name: "minHypeOut", type: "uint256" },
      { name: "deadline", type: "uint256" }, { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "hypeOut", type: "uint256" }],
  },
] as const;
const curveLimitsAbi = [
  { type: "function", name: "launchedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protectionPolicyId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protectionWindowSeconds", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "maxBuyBpsPerTransaction", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "maxBuyBpsPerAddress", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  {
    type: "function", name: "purchasedDuringProtection", stateMutability: "view",
    inputs: [{ name: "buyer", type: "address" }], outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "config", stateMutability: "view", inputs: [],
    outputs: [
      { name: "graduationThresholdHype", type: "uint256" }, { name: "virtualHypeReserve", type: "uint256" },
      { name: "virtualTokenReserve", type: "uint256" }, { name: "sniperTaxStartBps", type: "uint16" },
      { name: "sniperTaxDecaySeconds", type: "uint32" }, { name: "maxWalletBps", type: "uint16" },
      { name: "maxWalletWindowSeconds", type: "uint32" }, { name: "launchFeeHype", type: "uint256" },
    ],
  },
] as const;
const TOTAL_SUPPLY_WEI = 1_000_000_000n * 10n ** 18n;
const curveRevertReasons: Record<string, string> = Object.fromEntries([
  "CurveClosed", "Unauthorized", "Expired", "SlippageExceeded", "MaxWalletExceeded", "BuyLimitExceeded",
  "InvalidAmount", "TransferFailed",
].map((name) => [keccak256(toBytes(`${name}()`)).slice(0, 10), name]));

async function ethCall(to: Address, data: Hex) {
  return await rpc("eth_call", [{ to, data }, "latest"]) as Hex;
}

/// Dry-runs a call and reports a decoded Curve revert instead of throwing. `unknown` means the node could not tell
/// (for example the Curve Beacon does not expose the called function yet), never "will succeed".
async function simulateCurveCall(tx: { from: Address; to: Address; data: Hex; value: bigint }) {
  const providers = [config.rpcUrl, config.rpcFallbackUrl].filter(Boolean) as string[];
  for (const provider of providers) {
    try {
      const response = await fetch(provider, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [
            { from: tx.from, to: tx.to, data: tx.data, value: `0x${tx.value.toString(16)}` }, "latest",
            { [tx.from]: { balance: `0x${(tx.value * 2n + 10n ** 18n).toString(16)}` } },
          ],
        }),
      });
      if (!response.ok) continue;
      const payload = await response.json() as { result?: string; error?: { data?: string } };
      if (payload.result !== undefined) return { outcome: "success" as const };
      const selector = typeof payload.error?.data === "string" ? payload.error.data.slice(0, 10) : "";
      const reason = curveRevertReasons[selector];
      if (reason) return { outcome: "revert" as const, reason };
      return { outcome: "unknown" as const };
    } catch { /* try the next provider */ }
  }
  return { outcome: "unknown" as const };
}

/// The standard Uniswap Universal Router is verified against the Squeez hook on Robinhood mainnet (fork test
/// `SqueezUniversalRouterFork.t.sol`). Other chains keep the Squeez swap router as the only official route.
function standardRouterSupported() {
  return config.chain === "robinhood" && config.network === "mainnet"
    && Boolean(config.v4Execution.universalRouter && config.contracts.v4Quoter && config.contracts.squeezHook
      && config.v4Pool.lpFeeBps !== null && config.v4Pool.tickSpacing !== null);
}

function squeezPoolKey(tokenAddress: Address, quote: Address) {
  const [currency0, currency1] = BigInt(tokenAddress) < BigInt(quote) ? [tokenAddress, quote] : [quote, tokenAddress];
  const poolKey = {
    currency0: getAddress(currency0), currency1: getAddress(currency1),
    fee: Number(config.v4Pool.lpFeeBps), tickSpacing: Number(config.v4Pool.tickSpacing),
    hooks: getAddress(config.contracts.squeezHook!),
  };
  const poolId = keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
  ));
  return { poolKey, poolId };
}

const externalErc20Abi = [{
  type: "function", name: "approve", stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "success", type: "bool" }],
}] as const;
const tokenMetadataAbi = [
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "metadataURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

async function onchainMetadataUri(token: Address): Promise<string | null> {
  for (const functionName of ["tokenURI", "metadataURI"] as const) {
    try {
      const data = encodeFunctionData({ abi: tokenMetadataAbi, functionName });
      const result = await rpc("eth_call", [{ to: token, data }, "latest"]);
      const uri = decodeFunctionResult({ abi: tokenMetadataAbi, functionName, data: result as Hex });
      if (typeof uri === "string" && /^ipfs:\/\/[a-zA-Z0-9]+$/.test(uri)) return uri;
    } catch {
      // Legacy tokens may expose only metadataURI; try the next ERC-1046-compatible selector.
    }
  }
  return null;
}

function uploadMessage(address: string, nonce: string, expiresAt: number): string {
  return `Squeez metadata upload\nWallet: ${address}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
}

function xAuthMessage(address: string, nonce: string, expiresAt: number): string {
  return `Squeez X verification\nWallet: ${address}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
}

function sha256(value: string): string {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function cookieValue(req: IncomingMessage, name: string): string | null {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function safeReturnTo(value: unknown): string {
  const fallback = "https://squeez.tech/launch";
  if (typeof value !== "string") return fallback;
  try {
    const url = new URL(value);
    return config.allowedOrigins.has(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function cleanString(value: unknown, max: number, required = false): string {
  if (typeof value !== "string") {
    if (required) throw new Error("Invalid metadata field");
    return "";
  }
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new Error("Invalid metadata field");
  return result;
}

function cleanUrl(value: unknown): string {
  const result = cleanString(value, 200);
  if (result && !/^https:\/\//i.test(result)) throw new Error("Metadata links must use HTTPS");
  return result;
}

function safeMetadataText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeMetadataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200 || !/^https:\/\//i.test(value)) return null;
  return value;
}

function normalizeOnchainIdentity(value: string, maxLength: number): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > maxLength || [...normalized].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code > 0x7e;
  })) throw new Error("Invalid identity");
  return normalized;
}

function hammingDistance64(left: string, right: string): number {
  let difference = BigInt(left) ^ BigInt(right);
  let distance = 0;
  while (difference) {
    distance += Number(difference & 1n);
    difference >>= 1n;
  }
  return distance;
}

const protectedTargets = Object.values(SQUEEZ_NETWORKS)
  .filter((network) => network.stage === config.network)
  .map((network) => ({ chain: network.chain, stage: network.stage } satisfies DeploymentTarget));

async function tableExists(schema: string, table: string): Promise<boolean> {
  const result = await pool.query("select to_regclass($1) is not null as available", [`${schema}.${table}`]);
  return Boolean(result.rows[0]?.available);
}

async function activeIdentityConflict(nameCommitment: string, symbolCommitment: string) {
  const now = Math.floor(Date.now() / 1000);
  for (const target of protectedTargets) {
    const schema = deploymentSchema(target);
    if (!await tableExists(schema, "identity")) continue;
    const result = await pool.query(
      `select token, locked_until::text as "lockedUntil", permanently_locked as "permanentlyLocked"
        from "${schema}"."identity"
        where (name_commitment = $1 or symbol_commitment = $2)
          and (permanently_locked = true or locked_until > $3)
        order by registered_at asc limit 1`,
      [nameCommitment, symbolCommitment, now],
    );
    if (result.rows[0]) return { ...result.rows[0], chain: target.chain } as {
      token: string; lockedUntil: string | null; permanentlyLocked: boolean; chain: string;
    };
  }
  return null;
}

async function activeImageConflict(imageHash: string, perceptualHash?: string): Promise<string | null> {
  for (const target of protectedTargets) {
    const dataSchema = deploymentSchema(target);
    const systemSchema = operationalSchema(target);
    if (!await tableExists(systemSchema, "identity_image_evidence")
      || !await tableExists(dataSchema, "identity")) continue;
    const candidates = await pool.query(
      `select i.token, e.image_hash as "imageHash", e.perceptual_hash as "perceptualHash"
        from "${systemSchema}"."identity_image_evidence" e
        join "${dataSchema}"."identity" i on lower(i.metadata_hash) = lower(e.metadata_uri_hash)
        where i.permanently_locked = true or i.locked_until > extract(epoch from now())::bigint`,
    );
    const conflict = candidates.rows.find((candidate) => candidate.imageHash === imageHash
      || (perceptualHash && hammingDistance64(candidate.perceptualHash, perceptualHash) <= 5));
    if (conflict) return conflict.token;
  }
  return null;
}

const baseTokenColumns = `address, curve, creator, quote,
  creator_fee_bps as "creatorFeeBps", fee_recipient as "feeRecipient",
  fee_destination_kind as "feeDestinationKind", buyback_bps as "buybackBps",
  launch_config_id as "launchConfigId", name, symbol, metadata_uri as "metadataUri", status,
  case when status = 'graduated' then 'uniswap-v4' else 'curve' end as venue, pool,
  created_at as "createdAt", launch_tx_hash as "launchTxHash",
  launch_block_number as "launchBlockNumber", launch_log_index as "launchLogIndex",
  coalesce((
    select tr.hype_raised from "${config.databaseSchema}"."trade" tr
    where lower(tr.token) = lower(address) and tr.source = 'curve' and tr.hype_raised is not null
    order by tr.block_number desc, tr.log_index desc limit 1
  ), 0)::text as "hypeRaised",
  (select count(*)::int from "${config.databaseSchema}"."trade" tc
    where lower(tc.token) = lower(address)) as "tradeCount",
  coalesce((select sum(tv.hype_amount) from "${config.databaseSchema}"."trade" tv
    where lower(tv.token) = lower(address) and tv.timestamp >= extract(epoch from now())::bigint - 86400), 0)::text as "volume24hHype",
  coalesce((select lp.hype_amount from "${config.databaseSchema}"."trade" lp
    where lower(lp.token) = lower(address) and lp.token_amount > 0
    order by lp.block_number desc, lp.log_index desc limit 1), 0)::text as "lastHypeAmount",
  coalesce((select lp.token_amount from "${config.databaseSchema}"."trade" lp
    where lower(lp.token) = lower(address) and lp.token_amount > 0
    order by lp.block_number desc, lp.log_index desc limit 1), 0)::text as "lastTokenAmount"`;

let identityTableCache = { available: false, checkedAt: 0 };
async function tokenColumns(): Promise<string> {
  if (Date.now() - identityTableCache.checkedAt > 30_000) {
    const result = await pool.query("select to_regclass($1) is not null as available", [
      `${config.databaseSchema}.identity`,
    ]);
    identityTableCache = { available: Boolean(result.rows[0]?.available), checkedAt: Date.now() };
  }
  if (!identityTableCache.available) {
    return `${baseTokenColumns}, 'unavailable'::text as "identityStatus", false as "duplicateName",
      false as "duplicateSymbol", null::text as "originalToken", null::text as "lockedUntil",
      false as "permanentlyLocked"`;
  }
  return `${baseTokenColumns},
    case
      when not exists (select 1 from "${config.databaseSchema}"."identity" i where lower(i.token) = lower(address))
        then 'unverified'
      when exists (select 1 from "${config.databaseSchema}"."identity" i
        where lower(i.token) = lower(address) and (i.duplicate_name or i.duplicate_symbol)) then 'copy'
      else 'original'
    end as "identityStatus",
    coalesce((select i.duplicate_name from "${config.databaseSchema}"."identity" i
      where lower(i.token) = lower(address) limit 1), false) as "duplicateName",
    coalesce((select i.duplicate_symbol from "${config.databaseSchema}"."identity" i
      where lower(i.token) = lower(address) limit 1), false) as "duplicateSymbol",
    coalesce(
      (select original.token from "${config.databaseSchema}"."identity" original
        where original.duplicate_symbol = false and original.symbol_commitment =
          (select current.symbol_commitment from "${config.databaseSchema}"."identity" current
            where lower(current.token) = lower(address) limit 1) limit 1),
      (select original.token from "${config.databaseSchema}"."identity" original
        where original.duplicate_name = false and original.name_commitment =
          (select current.name_commitment from "${config.databaseSchema}"."identity" current
            where lower(current.token) = lower(address) limit 1) limit 1)
    ) as "originalToken",
    (select i.locked_until::text from "${config.databaseSchema}"."identity" i
      where lower(i.token) = lower(address) limit 1) as "lockedUntil",
    coalesce((select i.permanently_locked from "${config.databaseSchema}"."identity" i
      where lower(i.token) = lower(address) limit 1), false) as "permanentlyLocked"`;
}

async function rpc(method: string, params: unknown[] = []) {
  const providers = [config.rpcUrl, config.rpcFallbackUrl].filter(Boolean) as string[];
  let lastError: unknown;
  for (const provider of providers) {
    try {
      const response = await fetch(provider, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`RPC returned ${response.status}`);
      const payload = await response.json() as { result?: string; error?: { message?: string } };
      if (!payload.result) throw new Error(payload.error?.message ?? "RPC response is missing a result");
      return payload.result;
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("All RPC providers failed");
}

async function readiness() {
  const checks = {
    database: false,
    schema: false,
    rpc: false,
    contract: false,
    indexer: false,
  };
  let rpcBlock: number | null = null;
  let indexerBlock: number | null = null;
  const errors: string[] = [];

  const database = await Promise.allSettled([
    pool.query("select 1"),
    // Supabase's transaction pooler intentionally exposes a smaller compatibility surface than a direct
    // PostgreSQL session. information_schema works in both modes, while to_regnamespace() is unavailable there.
    pool.query("select exists (select 1 from information_schema.schemata where schema_name = $1) as available", [config.databaseSchema]),
    pool.query("select to_regclass($1) is not null as available", [`${config.databaseSchema}._ponder_checkpoint`]),
  ]);
  checks.database = database[0].status === "fulfilled";
  checks.schema = database[1].status === "fulfilled" && Boolean(database[1].value.rows[0]?.available);
  const checkpointTable = database[2].status === "fulfilled" && Boolean(database[2].value.rows[0]?.available);
  if (!checks.database) errors.push("database unavailable");
  if (!checks.schema) errors.push("database schema unavailable");

  const chain = await Promise.allSettled([
    rpc("eth_chainId"),
    rpc("eth_blockNumber"),
    config.contracts.factory ? rpc("eth_getCode", [config.contracts.factory, "latest"]) : Promise.resolve("0x"),
  ]);
  if (chain[0].status === "fulfilled") {
    checks.rpc = Number(BigInt(chain[0].value)) === config.chainId;
    if (!checks.rpc) errors.push("RPC chain ID mismatch");
  } else errors.push("RPC unavailable");
  if (chain[1].status === "fulfilled") rpcBlock = Number(BigInt(chain[1].value));
  checks.contract = chain[2].status === "fulfilled" && chain[2].value !== "0x";
  if (!checks.contract) errors.push("Factory bytecode unavailable");

  if (checkpointTable) {
    try {
      const result = await pool.query(`select substring(latest_checkpoint from 27 for 16)::bigint as "blockNumber"
        from "${config.databaseSchema}"._ponder_checkpoint
        order by latest_checkpoint desc limit 1`);
      indexerBlock = result.rows[0] ? Number(result.rows[0].blockNumber) : null;
      checks.indexer = rpcBlock !== null && indexerBlock !== null
        && Math.max(0, rpcBlock - indexerBlock) <= config.indexerMaxLagBlocks;
    } catch { checks.indexer = false; }
  }
  if (!checks.indexer) errors.push("indexer checkpoint unavailable or stale");

  const coreReady = checks.database && checks.schema && checks.rpc && checks.contract;
  const ready = coreReady && (config.capability === "read-only" || checks.indexer);
  return {
    ready,
    degraded: ready && !checks.indexer,
    capability: config.capability,
    target: `${config.chain}:${config.network}`,
    chainId: config.chainId,
    checks,
    blocks: { rpc: rpcBlock, indexer: indexerBlock },
    errors,
  };
}

async function writeSafety() {
  const checkedAt = Math.floor(Date.now() / 1000);
  const [rpcResult, indexerResult] = await Promise.allSettled([
    rpc("eth_blockNumber"),
    pool.query(`select
      substring(latest_checkpoint from 27 for 16)::bigint as "blockNumber",
      (select (value->>'heartbeat_at')::bigint / 1000 from "${config.databaseSchema}"._ponder_meta
        where key = 'app' limit 1) as "updatedAt"
      from "${config.databaseSchema}"._ponder_checkpoint
      order by latest_checkpoint desc limit 1`),
  ]);
  const rpcBlock = rpcResult.status === "fulfilled" ? Number(BigInt(rpcResult.value)) : null;
  const indexed = indexerResult.status === "fulfilled" ? indexerResult.value.rows[0] : null;
  const indexerBlock = indexed ? Number(indexed.blockNumber) : null;
  const indexerUpdatedAt = indexed?.updatedAt === null || indexed?.updatedAt === undefined
    ? null : Number(indexed.updatedAt);
  const lagBlocks = rpcBlock !== null && indexerBlock !== null ? Math.max(0, rpcBlock - indexerBlock) : null;
  const heartbeatStale = indexerUpdatedAt === null || checkedAt - indexerUpdatedAt > config.indexerStaleSeconds;
  const blockers = [
    ...(rpcBlock === null ? ["rpc-unavailable"] : []),
    ...(indexerBlock === null ? ["indexer-checkpoint-unavailable"] : []),
    ...(lagBlocks === null || lagBlocks > config.indexerMaxLagBlocks ? ["indexer-lag"] : []),
    ...(heartbeatStale ? ["indexer-heartbeat-stale"] : []),
  ];
  return { safe: blockers.length === 0, blockers, rpcBlock, indexerBlock, lagBlocks, indexerUpdatedAt };
}

const server = createServer(async (req, res) => {
  try {
    if (!cors(req, res)) return;
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const targetRoute = resolveTargetRoute(url.pathname, { chain: config.chain, stage: config.network });
    if (targetRoute.kind === "mismatch") {
        return json(res, 404, {
          error: "Deployment target is not served by this backend",
          requestedTarget: targetRoute.requestedTarget,
          servedTarget: targetRoute.servedTarget,
        });
    }
    if (targetRoute.kind === "canonical") {
      url.pathname = targetRoute.pathname;
      res.setHeader("x-squeez-target", `${config.chain}:${config.network}`);
    } else if (targetRoute.kind === "legacy") {
      res.setHeader("deprecation", "true");
      res.setHeader("sunset", "Tue, 01 Jun 2027 00:00:00 GMT");
      res.setHeader("link", `<${targetRoute.successor}>; rel=\"successor-version\"`);
    }

    const readOnlyAllowed = ["GET", "HEAD", "OPTIONS"].includes(req.method ?? "GET")
      || (req.method === "POST" && (url.pathname === "/rpc" || url.pathname === "/v1/rpc"));
    const readOnlyCredentialPath = url.pathname === "/v1/auth/x/nonce" || url.pathname === "/v1/metadata/nonce";
    const capabilityWriteIntent = !readOnlyAllowed || readOnlyCredentialPath;
    // OAuth authorization only creates short-lived, wallet-bound session state. It does not rely on indexed
    // token data, so an indexer lag must not prevent a creator from connecting or disconnecting X. Attestation
    // and metadata writes remain protected below because their anti-vamp conflict checks do depend on the indexer.
    const indexerIndependentOAuthPath = url.pathname === "/v1/auth/x/nonce"
      || url.pathname === "/v1/auth/x/start"
      || url.pathname === "/v1/auth/x/session";
    const healthSensitiveWriteIntent = capabilityWriteIntent && !indexerIndependentOAuthPath;
    if (config.capability === "read-only" && capabilityWriteIntent) {
      return json(res, 403, { error: "Deployment target is read-only", target: `${config.chain}:${config.network}` });
    }
    if (config.capability === "enabled" && healthSensitiveWriteIntent) {
      const safety = await writeSafety();
      if (!safety.safe) {
        return json(res, 503, {
          error: "Writes are temporarily disabled by the target health policy",
          target: `${config.chain}:${config.network}`,
          blockers: safety.blockers,
          lagBlocks: safety.lagBlocks,
        });
      }
    }
    const qualified = url.pathname.match(/^\/v1\/chains\/(\d+)(\/.*)?$/);
    if (qualified) {
      const requestedChainId = Number(qualified[1]);
      if (requestedChainId !== config.chainId) {
        return json(res, 404, { error: "Chain is not served by this API", chainId: requestedChainId });
      }
      url.pathname = `/v1${qualified[2] ?? ""}`;
    }

    if (req.method === "GET" && url.pathname === "/v1/deployments") {
      return json(res, 200, Object.values(SQUEEZ_NETWORKS).map((target) => {
        const active = target.chain === config.chain && target.stage === config.network;
        return {
          chain: target.chain,
          stage: target.stage,
          chainId: target.chainId,
          name: target.name,
          shortName: target.shortName,
          nativeCurrency: target.nativeCurrency,
          explorer: target.explorer,
          capability: active ? config.capability : "coming-soon",
          apiBasePath: `/v1/${target.chain}/${target.stage}`,
        };
      }));
    }
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
      return json(res, 200, { ok: true, chain: config.chain, chainId: config.chainId, network: config.network });
    }
    if (req.method === "GET" && (url.pathname === "/ready" || url.pathname === "/v1/ready")) {
      const result = await readiness();
      return json(res, result.ready ? 200 : 503, result);
    }
    if (req.method === "GET" && url.pathname === "/v1/status") {
      const checkedAt = Math.floor(Date.now() / 1000);
      const [rpcResult, indexerResult] = await Promise.allSettled([
        rpc("eth_blockNumber"),
        pool.query(`select
          substring(latest_checkpoint from 27 for 16)::bigint as "blockNumber",
          (select (value->>'heartbeat_at')::bigint / 1000 from "${config.databaseSchema}"._ponder_meta
            where key = 'app' limit 1) as "updatedAt"
          from "${config.databaseSchema}"._ponder_checkpoint
          order by latest_checkpoint desc limit 1`),
      ]);
      const rpcBlock = rpcResult.status === "fulfilled" ? Number(BigInt(rpcResult.value)) : null;
      const indexed = indexerResult.status === "fulfilled" ? indexerResult.value.rows[0] : null;
      const indexerBlock = indexed ? Number(indexed.blockNumber) : null;
      const indexerUpdatedAt = indexed ? Number(indexed.updatedAt) : null;
      const lagBlocks = rpcBlock !== null && indexerBlock !== null ? Math.max(0, rpcBlock - indexerBlock) : null;
      // A checkpoint can be old simply because the chain has not produced a new block.
      // Treat age as stale only while the indexer is actually behind the RPC tip.
      const stale = lagBlocks === null || lagBlocks > config.indexerMaxLagBlocks
        || (lagBlocks > 0 && indexerUpdatedAt !== null
          && checkedAt - indexerUpdatedAt > config.indexerStaleSeconds);
      const writeSafe = config.capability === "enabled" && rpcBlock !== null && !stale;
      const writeBlockers = [
        ...(config.capability !== "enabled" ? ["target-read-only"] : []),
        ...(rpcBlock === null ? ["rpc-unavailable"] : []),
        ...(indexerBlock === null ? ["indexer-checkpoint-unavailable"] : []),
        ...(stale ? ["indexer-stale"] : []),
      ];
      return json(res, rpcBlock !== null ? 200 : 503, {
        chain: config.chain, chainId: config.chainId, network: config.network, checkedAt,
        capability: config.capability, writeSafe, writeBlockers,
        rpc: { ok: rpcBlock !== null, blockNumber: rpcBlock },
        indexer: { ok: indexerBlock !== null, blockNumber: indexerBlock, updatedAt: indexerUpdatedAt, lagBlocks, stale },
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/identity/check") {
      let name: string;
      let symbol: string;
      try {
        name = normalizeOnchainIdentity(url.searchParams.get("name") ?? "", 64);
        symbol = normalizeOnchainIdentity(url.searchParams.get("symbol") ?? "", 16);
      } catch {
        return json(res, 400, { error: "Name or symbol is invalid" });
      }
      const table = await pool.query("select to_regclass($1) is not null as available", [
        `${config.databaseSchema}.identity`,
      ]);
      if (!table.rows[0]?.available) {
        return json(res, 200, { chainId: config.chainId, configured: false, available: true, warnings: [] });
      }
      const nameCommitment = keccak256(toBytes(name));
      const symbolCommitment = keccak256(toBytes(symbol));
      const heuristicSymbol = symbol.replace(/^\$+/, "");
      const heuristicCommitment = heuristicSymbol && heuristicSymbol !== symbol
        ? keccak256(toBytes(heuristicSymbol)) : null;
      const matches = await pool.query(
        `select token, duplicate_name as "duplicateName", duplicate_symbol as "duplicateSymbol",
          locked_until::text as "lockedUntil", permanently_locked as "permanentlyLocked",
          name_commitment as "nameCommitment", symbol_commitment as "symbolCommitment"
        from "${config.databaseSchema}"."identity"
        where name_commitment = $1 or symbol_commitment = $2
          or ($3::text is not null and symbol_commitment = $3)
        order by registered_at asc`,
        [nameCommitment, symbolCommitment, heuristicCommitment],
      );
      const exact = matches.rows.find((row) => row.nameCommitment === nameCommitment
        || row.symbolCommitment === symbolCommitment);
      const now = Math.floor(Date.now() / 1000);
      const locked = Boolean(exact?.permanentlyLocked)
        || Number(exact?.lockedUntil ?? 0) > now;
      const heuristic = matches.rows.find((row) => row !== exact);
      let crossChain: { token: string } | undefined;
      if (config.crossChainDatabaseSchema) {
        const crossTable = await pool.query("select to_regclass($1) is not null as available", [
          `${config.crossChainDatabaseSchema}.identity`,
        ]);
        if (crossTable.rows[0]?.available) {
          const result = await pool.query(
            `select token from "${config.crossChainDatabaseSchema}"."identity"
              where name_commitment = $1 or symbol_commitment = $2 order by registered_at asc limit 1`,
            [nameCommitment, symbolCommitment],
          );
          crossChain = result.rows[0] as { token: string } | undefined;
        }
      }
      const warnings = [
        ...(heuristic ? [{ type: "look-alike", originalToken: heuristic.token }] : []),
        ...(crossChain ? [{
          type: "cross-chain",
          originalToken: crossChain.token,
          chain: "cross-chain",
        }] : []),
      ];
      const globalConflict = await activeIdentityConflict(nameCommitment, symbolCommitment);
      return json(res, 200, {
        chainId: config.chainId,
        configured: true,
        available: !locked && !globalConflict,
        duplicate: Boolean(exact),
        lockedUntil: exact?.lockedUntil ?? null,
        permanentlyLocked: Boolean(exact?.permanentlyLocked),
        originalToken: exact?.token ?? globalConflict?.token ?? null,
        warnings: globalConflict && globalConflict.chain !== config.chain
          ? [...warnings, { type: "cross-chain-lock", originalToken: globalConflict.token, chain: globalConflict.chain }]
          : warnings,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/auth/x/nonce") {
      const rawAddress = url.searchParams.get("address");
      if (!rawAddress) return json(res, 400, { error: "Wallet address is required" });
      let address: Address;
      try { address = getAddress(rawAddress); } catch { return json(res, 400, { error: "Invalid wallet address" }); }
      const nonce = base64Url(randomBytes(32));
      const expiresAt = Date.now() + 5 * 60_000;
      xAuthNonces.set(address.toLowerCase(), { nonce, expiresAt });
      return json(res, 200, { nonce, expiresAt, message: xAuthMessage(address, nonce, expiresAt) });
    }
    if (req.method === "POST" && url.pathname === "/v1/auth/x/start") {
      if (!config.xAttestation.enabled) return json(res, 503, { error: "X verification is not enabled" });
      const payload = await body(req) as Record<string, unknown>;
      let address: Address;
      try { address = getAddress(cleanString(payload.address, 42, true)); }
      catch { return json(res, 400, { error: "Invalid wallet address" }); }
      const challenge = xAuthNonces.get(address.toLowerCase());
      xAuthNonces.delete(address.toLowerCase());
      if (!challenge || challenge.expiresAt < Date.now()) {
        return json(res, 401, { error: "X verification nonce is missing or expired" });
      }
      const signature = cleanString(payload.signature, 132, true) as Hex;
      const valid = await verifyMessage({
        address,
        message: xAuthMessage(address, challenge.nonce, challenge.expiresAt),
        signature,
      });
      if (!valid) return json(res, 401, { error: "Invalid wallet signature" });

      const state = base64Url(randomBytes(32));
      const verifier = base64Url(randomBytes(48));
      const codeChallenge = base64Url(createHash("sha256").update(verifier).digest());
      const returnTo = safeReturnTo(payload.returnTo);
      await pool.query(
        `insert into "${config.systemLogSchema}"."x_oauth_request"
          (state_hash, code_verifier, wallet, return_to, expires_at)
          values ($1, $2, $3, $4, now() + interval '10 minutes')`,
        [sha256(state), verifier, address.toLowerCase(), returnTo],
      );
      const authorize = new URL("https://x.com/i/oauth2/authorize");
      authorize.search = new URLSearchParams({
        response_type: "code",
        client_id: config.xAttestation.clientId!,
        redirect_uri: config.xAttestation.redirectUri!,
        scope: "users.read tweet.read",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      return json(res, 200, { authorizeUrl: authorize.toString() });
    }
    if (req.method === "GET" && url.pathname === "/v1/auth/x/callback") {
      if (!config.xAttestation.enabled) return json(res, 503, { error: "X verification is not enabled" });
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!state || !code) return json(res, 400, { error: "X callback is missing code or state" });
      const request = await pool.query(
        `delete from "${config.systemLogSchema}"."x_oauth_request"
          where state_hash = $1 and expires_at > now()
          returning code_verifier as "codeVerifier", wallet, return_to as "returnTo"`,
        [sha256(state)],
      );
      const pending = request.rows[0] as { codeVerifier: string; wallet: string; returnTo: string } | undefined;
      if (!pending) return json(res, 401, { error: "X OAuth state is invalid or expired" });

      const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${Buffer.from(`${config.xAttestation.clientId}:${config.xAttestation.clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          redirect_uri: config.xAttestation.redirectUri!,
          code_verifier: pending.codeVerifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const tokenPayload = await tokenResponse.json() as { access_token?: string; error_description?: string };
      if (!tokenResponse.ok || !tokenPayload.access_token) {
        return json(res, 502, { error: tokenPayload.error_description ?? "X token exchange failed" });
      }
      const userResponse = await fetch("https://api.x.com/2/users/me?user.fields=username", {
        headers: { authorization: `Bearer ${tokenPayload.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const userPayload = await userResponse.json() as { data?: { id?: string; username?: string } };
      if (!userResponse.ok || !userPayload.data?.id || !userPayload.data.username) {
        return json(res, 502, { error: "X user lookup failed" });
      }
      const xUserIdHash = `0x${createHmac("sha256", config.xAttestation.clientSecret!)
        .update(userPayload.data.id).digest("hex")}`;
      const session = base64Url(randomBytes(48));
      await pool.query(
        `insert into "${config.systemLogSchema}"."x_creator_session"
          (session_hash, wallet, x_user_id_hash, username, expires_at)
          values ($1, $2, $3, $4, now() + interval '2 hours')`,
        [sha256(session), pending.wallet, xUserIdHash, userPayload.data.username],
      );
      res.setHeader("set-cookie", `squeez_x_session=${encodeURIComponent(session)}; HttpOnly; Secure; SameSite=Lax; Path=/v1; Max-Age=7200`);
      res.writeHead(302, { location: pending.returnTo }).end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/auth/x/session") {
      const session = cookieValue(req, "squeez_x_session");
      if (!session) return json(res, 200, { verified: false });
      const result = await pool.query(
        `select wallet, username, expires_at as "expiresAt"
          from "${config.systemLogSchema}"."x_creator_session"
          where session_hash = $1 and revoked_at is null and expires_at > now() limit 1`,
        [sha256(session)],
      );
      const verified = result.rows[0];
      return json(res, 200, verified ? { verified: true, ...verified } : { verified: false });
    }
    if (req.method === "DELETE" && url.pathname === "/v1/auth/x/session") {
      const session = cookieValue(req, "squeez_x_session");
      if (session) {
        await pool.query(
          `update "${config.systemLogSchema}"."x_creator_session" set revoked_at = now()
            where session_hash = $1 and revoked_at is null`,
          [sha256(session)],
        );
      }
      res.setHeader("set-cookie", "squeez_x_session=; HttpOnly; Secure; SameSite=Lax; Path=/v1; Max-Age=0");
      return json(res, 200, { verified: false });
    }
    if (req.method === "POST" && url.pathname === "/v1/auth/x/attestation") {
      if (!config.xAttestation.enabled || !config.xAttestation.attesterPrivateKey || !config.contracts.factory) {
        return json(res, 503, { error: "Creator attestation is not configured" });
      }
      const session = cookieValue(req, "squeez_x_session");
      if (!session) return json(res, 401, { error: "Connect and verify X before requesting an attestation" });
      const payload = await body(req) as Record<string, unknown>;
      let wallet: Address;
      try { wallet = getAddress(cleanString(payload.wallet, 42, true)); }
      catch { return json(res, 400, { error: "Invalid wallet address" }); }
      const metadataURI = cleanString(payload.metadataURI, 200, true);
      if (!/^ipfs:\/\/[a-zA-Z0-9]+$/.test(metadataURI)) {
        return json(res, 400, { error: "Metadata URI must be an IPFS URI" });
      }
      const imageHash = cleanString(payload.imageHash, 66, true) as Hex;
      if (!/^0x[a-fA-F0-9]{64}$/.test(imageHash)) return json(res, 400, { error: "Invalid image hash" });
      const nameCommitment = keccak256(toBytes(normalizeOnchainIdentity(cleanString(payload.name, 64, true), 64)));
      const symbolCommitment = keccak256(toBytes(normalizeOnchainIdentity(cleanString(payload.symbol, 16, true), 16)));
      const identityConflict = await activeIdentityConflict(nameCommitment, symbolCommitment);
      if (identityConflict) {
        return json(res, 409, {
          error: "This identity is locked by an existing token on another Squeez deployment.",
          originalToken: identityConflict.token,
          chain: identityConflict.chain,
        });
      }
      const imageConflict = await activeImageConflict(imageHash);
      if (imageConflict) {
        return json(res, 409, { error: "This image is locked by an existing token.", originalToken: imageConflict });
      }

      const verified = await pool.query(
        `select wallet, x_user_id_hash as "socialHash" from "${config.systemLogSchema}"."x_creator_session"
          where session_hash = $1 and revoked_at is null and expires_at > now() limit 1`,
        [sha256(session)],
      );
      const identity = verified.rows[0] as { wallet: string; socialHash: Hex } | undefined;
      if (!identity || identity.wallet.toLowerCase() !== wallet.toLowerCase()) {
        return json(res, 401, { error: "The verified X session does not belong to this wallet" });
      }

      const nonceBytes = randomBytes(8);
      nonceBytes[0] &= 0x7f;
      const nonce = nonceBytes.readBigUInt64BE();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);
      const factory = getAddress(config.contracts.factory);
      const account = privateKeyToAccount(config.xAttestation.attesterPrivateKey as Hex);
      const attestation = {
        creator: wallet,
        socialHash: identity.socialHash,
        nameCommitment,
        symbolCommitment,
        metadataHash: keccak256(toBytes(metadataURI)),
        imageHash,
        nonce,
        deadline,
      } as const;
      const signature = await account.signTypedData({
        domain: {
          name: "Squeez Launch Factory",
          version: "1",
          chainId: config.chainId,
          verifyingContract: factory,
        },
        types: {
          CreatorAttestation: [
            { name: "creator", type: "address" },
            { name: "socialHash", type: "bytes32" },
            { name: "nameCommitment", type: "bytes32" },
            { name: "symbolCommitment", type: "bytes32" },
            { name: "metadataHash", type: "bytes32" },
            { name: "imageHash", type: "bytes32" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "CreatorAttestation",
        message: attestation,
      });

      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [identity.socialHash]);
        const usage = await client.query(
          `select count(*)::int as count from "${config.systemLogSchema}"."x_attestation_usage"
            where x_user_id_hash = $1 and created_at >= now() - interval '24 hours'`,
          [identity.socialHash],
        );
        if (Number(usage.rows[0]?.count ?? 0) >= config.xAttestation.maxLaunchesPer24h) {
          await client.query("rollback");
          return json(res, 429, { error: "This X account has reached its verified launch limit for 24 hours" });
        }
        await client.query(
          `insert into "${config.systemLogSchema}"."x_attestation_usage"
            (wallet, x_user_id_hash, chain_id, factory, nonce) values ($1, $2, $3, $4, $5)`,
          [wallet.toLowerCase(), identity.socialHash, config.chainId, factory.toLowerCase(), nonce.toString()],
        );
        await client.query("commit");
      } catch (cause) {
        await client.query("rollback");
        throw cause;
      } finally {
        client.release();
      }
      return json(res, 201, {
        attestation: {
          ...attestation,
          nonce: nonce.toString(),
          deadline: deadline.toString(),
        },
        signature,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/metadata/nonce") {
      const rawAddress = url.searchParams.get("address");
      if (!rawAddress) return json(res, 400, { error: "Wallet address is required" });
      let address: Address;
      try { address = getAddress(rawAddress); } catch { return json(res, 400, { error: "Invalid wallet address" }); }
      const nonce = randomBytes(24).toString("hex");
      const expiresAt = Date.now() + 5 * 60_000;
      const requestedId = url.searchParams.get("requestId");
      const requestId = requestedId && /^[0-9a-f-]{36}$/i.test(requestedId) ? requestedId : randomUUID();
      uploadNonces.set(address.toLowerCase(), { nonce, expiresAt, requestId });
      void writeSystemLog(pool, config.systemLogSchema, { source: "web", event: LOG_EVENTS.metadataNonceIssued,
        wallet: address, chainId: config.chainId, requestId });
      return json(res, 200, { nonce, expiresAt, requestId, message: uploadMessage(address, nonce, expiresAt) });
    }
    if (req.method === "POST" && url.pathname === "/v1/metadata") {
      if (!config.pinata.jwt) return json(res, 503, { error: "Metadata upload is not configured" });
      const payload = await body(req, 7_200_000) as Record<string, unknown>;
      let address: Address;
      try { address = getAddress(cleanString(payload.address, 42, true)); }
      catch { return json(res, 400, { error: "Invalid wallet address" }); }
      const auth = uploadNonces.get(address.toLowerCase());
      uploadNonces.delete(address.toLowerCase());
      if (!auth || auth.expiresAt < Date.now()) return json(res, 401, { error: "Upload nonce is missing or expired" });
      const signature = cleanString(payload.signature, 132, true) as Hex;
      const valid = await verifyMessage({
        address,
        message: uploadMessage(address, auth.nonce, auth.expiresAt),
        signature,
      });
      if (!valid) return json(res, 401, { error: "Invalid wallet signature" });
      void writeSystemLog(pool, config.systemLogSchema, { source: "web", event: LOG_EVENTS.metadataUploadRequested,
        wallet: address, chainId: config.chainId, requestId: auth.requestId });

      const imageData = cleanString(payload.image, 7_100_000, true);
      const match = imageData.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json(res, 400, { error: "Image must be PNG, JPEG, WebP, or GIF" });
      const image = Buffer.from(match[2], "base64");
      if (!image.length || image.length > 5 * 1024 * 1024) return json(res, 400, { error: "Image exceeds 5 MiB" });
      let symbol: string;
      try {
        // Accept `ticker` as a compatibility alias for web clients deployed
        // before the metadata API standardized on `symbol`.
        symbol = cleanString(payload.symbol ?? payload.ticker, 16, true).toUpperCase();
      } catch {
        return json(res, 400, { error: "Token symbol is required" });
      }
      if (!/^[A-Z0-9]{2,16}$/.test(symbol)) return json(res, 400, { error: "Invalid token symbol" });
      try {
        const evidence = await computeImageEvidence(image);
        const conflictingToken = await activeImageConflict(evidence.imageHash, evidence.perceptualHash);
        if (conflictingToken) {
          return json(res, 409, {
            error: "This image is too similar to an identity that is currently locked.",
            originalToken: conflictingToken,
          });
        }
        const normalizedName = normalizeOnchainIdentity(cleanString(payload.name, 64, true), 64);
        const normalizedSymbol = normalizeOnchainIdentity(symbol, 16);
        const result = await pinLaunchMetadata({
          image, imageMime: match[1], imageExtension: imageTypes.get(match[1])!, evidence,
          name: cleanString(payload.name, 64, true), symbol,
          description: cleanString(payload.description, 280), website: cleanUrl(payload.website),
          x: cleanUrl(payload.x), telegram: cleanUrl(payload.telegram),
        });
        const evidenceTable = await pool.query("select to_regclass($1) is not null as available", [
          `${config.systemLogSchema}.identity_image_evidence`,
        ]);
        if (evidenceTable.rows[0]?.available) {
          await pool.query(
            `insert into "${config.systemLogSchema}"."identity_image_evidence"
              (metadata_uri_hash, image_hash, perceptual_hash, name_commitment, symbol_commitment, wallet)
              values ($1, $2, $3, $4, $5, $6) on conflict (metadata_uri_hash) do nothing`,
            [
              keccak256(toBytes(result.metadataUri)), result.imageHash, result.perceptualHash,
              keccak256(toBytes(normalizedName)), keccak256(toBytes(normalizedSymbol)), address.toLowerCase(),
            ],
          );
        }
        void writeSystemLog(pool, config.systemLogSchema, { source: "web", event: LOG_EVENTS.metadataUploadSucceeded,
          wallet: address, chainId: config.chainId, requestId: auth.requestId,
          context: { imageUri: result.imageUri, metadataUri: result.metadataUri } });
        return json(res, 201, { ...result, requestId: auth.requestId });
      } catch (error) {
        void writeSystemLog(pool, config.systemLogSchema, { source: "web", level: "error",
          event: LOG_EVENTS.metadataUploadFailed, wallet: address, chainId: config.chainId,
          requestId: auth.requestId, message: error instanceof Error ? error.message : "Upload failed" });
        throw error;
      }
    }
    if (req.method === "POST" && url.pathname === "/v1/logs") {
      const payload = await body(req) as Record<string, unknown>;
      const event = cleanString(payload.event, 80, true) as LogEvent;
      if (!WEB_LOG_EVENTS.includes(event)) return json(res, 400, { error: "Unsupported log event" });
      const requestId = cleanString(payload.requestId, 36, true);
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json(res, 400, { error: "Invalid request ID" });
      const wallet = cleanString(payload.wallet, 42);
      const txHash = cleanString(payload.txHash, 66);
      void writeSystemLog(pool, config.systemLogSchema, {
        source: "web", level: event === LOG_EVENTS.txFailed || event === LOG_EVENTS.txRejected ? "error" : "info",
        event, requestId, chainId: config.chainId,
        wallet: /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : undefined,
        txHash: /^0x[a-fA-F0-9]{64}$/.test(txHash) ? txHash : undefined,
        message: cleanString(payload.message, 300),
      });
      return json(res, 202, { accepted: true });
    }
    if (req.method === "GET" && url.pathname === "/v1/config") {
      const configured = Object.values(config.contracts).every(Boolean)
        && Object.values(config.launchConfig).every(Boolean)
        && Object.values(config.v4Pool).every((value) => value !== null);
      const launchConfig = {
        ...config.launchConfig,
        graduationThresholdHype: config.launchConfig.graduationThresholdHype
          ? formatEther(BigInt(config.launchConfig.graduationThresholdHype)) : null,
        launchFeeHype: config.launchConfig.launchFeeHype
          ? formatEther(BigInt(config.launchConfig.launchFeeHype)) : null,
      };
      return json(res, 200, {
        configured,
        capability: config.capability,
        release: {
          ...config.release,
          maxOpeningBuyNative: formatEther(BigInt(config.release.maxOpeningBuyWei)),
        },
        network: config.network,
        creatorAttestation: {
          enabled: config.xAttestation.enabled,
          configured: Boolean(config.xAttestation.clientId && config.xAttestation.clientSecret
            && config.xAttestation.redirectUri && config.xAttestation.attesterPrivateKey),
          required: config.xAttestation.required,
          optional: !config.xAttestation.required,
          maxLaunchesPer24h: config.xAttestation.maxLaunchesPer24h,
        },
        chain: {
          id: config.chainId,
          slug: config.chain,
          name: config.networkInfo.name,
          explorer: config.explorer,
        },
        contracts: config.contracts,
        v4Pool: config.v4Pool,
        launchConfig,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/stats") {
      const zero = "0x0000000000000000000000000000000000000000";
      const [trades, creatorFees, protocolFees, burned, launches] = await Promise.all([
        pool.query(`select coalesce(sum(hype_amount), 0)::text as value, count(*)::int as count
          from "${config.databaseSchema}"."trade" where timestamp >= extract(epoch from now())::bigint - 86400`),
        pool.query(`select coalesce(sum(amount), 0)::text as value from "${config.databaseSchema}"."creator_fee"
          where kind = 'accrued' and lower(asset) = lower($1) and timestamp >= extract(epoch from now())::bigint - 86400`, [zero]),
        pool.query(`select coalesce(sum(buyback_amount + treasury_amount), 0)::text as value
          from "${config.databaseSchema}"."protocol_fee" where lower(asset) = lower($1)
          and timestamp >= extract(epoch from now())::bigint - 86400`, [zero]),
        pool.query(`select coalesce(sum(amount), 0)::text as value from "${config.databaseSchema}"."burn"`),
        pool.query(`select count(*)::int as total, count(*) filter (where status = 'graduated')::int as graduated
          from "${config.databaseSchema}"."token"`),
      ]);
      return json(res, 200, {
        chainId: config.chainId,
        volume24hHype: trades.rows[0].value,
        trades24h: trades.rows[0].count,
        creatorFees24hHype: creatorFees.rows[0].value,
        protocolFees24hHype: protocolFees.rows[0].value,
        squeezBurned: burned.rows[0].value,
        tokensLaunched: launches.rows[0].total,
        tokensGraduated: launches.rows[0].graduated,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/quotes") {
      if (!config.contracts.quoteRegistry) return json(res, 503, { error: "Quote registry is not configured" });
      const data = encodeFunctionData({ abi: quoteRegistryAbi, functionName: "getActiveQuotes" });
      const result = await rpc("eth_call", [{ to: config.contracts.quoteRegistry, data }, "latest"]);
      const quotes = decodeFunctionResult({ abi: quoteRegistryAbi, functionName: "getActiveQuotes", data: result as Hex });
      const classified = quotes.map((quote) => {
        const asset = quote.asset.toLowerCase();
        const category = asset === "0x0000000000000000000000000000000000000000" ? "crypto"
          : config.quoteAssets.usdc?.toLowerCase() === asset ? "stable"
          : config.quoteAssets.unit?.toLowerCase() === asset || config.quoteAssets.ondo?.toLowerCase() === asset ? "stock" : "unclassified";
        const symbol = category === "crypto" ? config.nativeCurrencySymbol : category === "stable" ? "USDC"
          : config.quoteAssets.unit?.toLowerCase() === asset ? "UNIT" : config.quoteAssets.ondo?.toLowerCase() === asset ? "ONDO" : null;
        return { asset: quote.asset, decimals: quote.decimals, category, symbol, routeConfigured: quote.routerPath !== "0x" };
      });
      return json(res, 200, classified.map(chainQualified));
    }
    if (req.method === "GET" && url.pathname === "/v1/tokens") {
      const columns = await tokenColumns();
      const result = await pool.query(`select ${columns} from "${config.databaseSchema}"."token" order by "createdAt" desc limit 100`);
      return json(res, 200, result.rows.map(chainQualified));
    }
    if (req.method === "GET" && ["/v1/token-list.json", "/v1/tokenlist.json"].includes(url.pathname)) {
      const result = await pool.query(
        `select address, coalesce(name, '') as name, coalesce(symbol, '') as symbol,
          created_at as "createdAt"
         from "${config.databaseSchema}"."token"
         where name is not null and symbol is not null
         order by created_at asc limit 10000`,
      );
      const targetPath = `${config.chain}/${config.network}`;
      const publicApiUrl = config.publicApiUrl.replace(/\/$/, "");
      const newestTimestamp = result.rows.length
        ? new Date(Number(result.rows.at(-1).createdAt) * 1000).toISOString()
        : new Date(0).toISOString();
      return publicJson(res, 200, {
        name: `Squeez ${config.chain} ${config.network}`.slice(0, 30),
        timestamp: newestTimestamp,
        version: { major: 1, minor: result.rows.length, patch: 0 },
        logoURI: "https://squeez.tech/squeez-logo.png",
        keywords: ["squeez", config.chain, config.network, "launchpad"],
        tags: {
          squeez: { name: "Squeez", description: "Token launched through the Squeez protocol" },
        },
        tokens: result.rows.map((token) => ({
          chainId: config.chainId,
          address: getAddress(token.address),
          decimals: 18,
          name: String(token.name).slice(0, 60),
          symbol: String(token.symbol).slice(0, 20),
          logoURI: `${publicApiUrl}/v1/${targetPath}/tokens/${getAddress(token.address)}/logo`,
          tags: ["squeez"],
        })),
      }, 300);
    }
    if (req.method === "GET" && url.pathname === "/v1/integrations/launchpad.json") {
      const base = `${config.publicApiUrl.replace(/\/$/, "")}/v1/${config.chain}/${config.network}`;
      return publicJson(res, 200, {
        schema: "squeez.external-launchpad.v1",
        name: "Squeez",
        chain: config.chain,
        network: config.network,
        chainId: config.chainId,
        nativeCurrency: config.networkInfo.nativeCurrency,
        explorer: config.explorer,
        contracts: {
          factory: config.contracts.factory,
          quoteRegistry: config.contracts.quoteRegistry,
          feeVault: config.contracts.feeVault,
          swapRouter: config.contracts.swapRouter,
          v4Quoter: config.contracts.v4Quoter,
          hook: config.contracts.squeezHook,
          universalRouter: standardRouterSupported() ? config.v4Execution.universalRouter : null,
          permit2: standardRouterSupported() ? config.v4Execution.permit2 : null,
        },
        discovery: {
          tokenList: `${base}/token-list.json`,
          tokens: `${base}/tokens`,
          token: `${base}/tokens/{address}`,
          metadata: `${base}/tokens/{address}/metadata`,
          logo: `${base}/tokens/{address}/logo`,
          route: `${base}/tokens/{address}/route`,
          pool: `${base}/tokens/{address}/pool`,
          quoteAndBuild: `${base}/tokens/{address}/quote?side={buy|sell}&amountWei={integer}&recipient={address, optional: builds buyTo/sellTo for routers}`,
        },
        venues: {
          preGraduation: {
            id: "squeez-curve",
            executable: true,
            quoteFunctions: ["quoteBuy(uint256)", "quoteSell(uint256)"],
            executionFunctions: [
              "buy(uint256,uint256)", "sell(uint256,uint256,uint256)",
              "buyTo(address,uint256,uint256)", "sellTo(uint256,uint256,uint256,address)",
            ],
          },
          postGraduation: standardRouterSupported()
            ? {
              id: "uniswap-v4",
              executable: true,
              router: "uniswap-v4-universal",
              fallbackRouter: "squeez-swap-router",
              poolKeyUrl: `${base}/tokens/{address}/pool`,
              note: "Swap with the standard Uniswap Universal Router (V4_SWAP, exact-input single) using the PoolKey "
                + "from poolKeyUrl; quote with the v4 Quoter. Token input needs a Permit2 allowance for the router.",
            }
            : {
              id: "uniswap-v4",
              executable: true,
              router: "squeez-swap-router",
              poolKeyUrl: `${base}/tokens/{address}/pool`,
              note: "Use SqueezSwapRouter.swapExactInput with the PoolKey from poolKeyUrl.",
            },
        },
        compatibility: {
          evmAggregators: "integration-ready",
          solanaLaunchpads: "not-compatible-without-bridge-and-wrapped-asset",
        },
      }, 300);
    }
    const routeMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/route$/);
    if (req.method === "GET" && routeMatch) {
      const result = await pool.query(
        `select address, curve, pool, status, name, symbol, quote, creator_fee_bps as "creatorFeeBps"
         from "${config.databaseSchema}"."token" where lower(address) = lower($1) limit 1`,
        [routeMatch[1]],
      );
      const token = result.rows[0];
      if (!token) return json(res, 404, { error: "Token not found" });
      const base = `${config.publicApiUrl.replace(/\/$/, "")}/v1/${config.chain}/${config.network}`;
      const venue = token.status === "graduated" ? "uniswap-v4" : "squeez-curve";
      return publicJson(res, 200, {
        schema: "squeez.execution-route.v1",
        chainId: config.chainId,
        chain: config.chain,
        network: config.network,
        token: getAddress(token.address),
        name: token.name,
        symbol: token.symbol,
        status: token.status,
        venue,
        quoteAsset: getAddress(token.quote),
        curve: token.curve ? getAddress(token.curve) : null,
        pool: token.pool ? getAddress(token.pool) : null,
        creatorFeeBps: Number(token.creatorFeeBps),
        executable: true,
        quoteAndBuildUrl: venue === "squeez-curve"
          ? `${base}/tokens/${getAddress(token.address)}/quote`
          : null,
        integration: venue === "squeez-curve"
          ? { kind: "custom-bonding-curve", approvalRequiredForSell: true }
          : {
            kind: "uniswap-v4",
            router: standardRouterSupported() ? "uniswap-v4-universal" : "squeez-swap-router",
            poolKeyUrl: `${base}/tokens/${getAddress(token.address)}/pool`,
          },
      }, 15);
    }
    const poolMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/pool$/);
    if (req.method === "GET" && poolMatch) {
      const result = await pool.query(
        `select address, pool, status, quote from "${config.databaseSchema}"."token" where lower(address) = lower($1) limit 1`,
        [poolMatch[1]],
      );
      const token = result.rows[0];
      if (!token) return json(res, 404, { error: "Token not found" });
      if (token.status !== "graduated" || !token.pool) {
        return json(res, 409, { error: "Token has not graduated; it trades on its bonding curve", venue: "squeez-curve" });
      }
      if (!config.contracts.squeezHook || config.v4Pool.lpFeeBps === null || config.v4Pool.tickSpacing === null) {
        return json(res, 503, { error: "Uniswap v4 pool parameters are not configured" });
      }
      const { poolKey, poolId } = squeezPoolKey(getAddress(token.address), getAddress(token.quote));
      // The curve stores the low 160 bits of the PoolId; refuse to serve a PoolKey that does not match it.
      if (getAddress(`0x${poolId.slice(-40)}`) !== getAddress(token.pool)) {
        return json(res, 502, { error: "Derived PoolKey does not match the graduated pool" });
      }
      const standard = standardRouterSupported();
      return publicJson(res, 200, {
        schema: "squeez.v4-pool.v1",
        chainId: config.chainId,
        token: getAddress(token.address),
        poolKey,
        poolId,
        pool: getAddress(token.pool),
        v4Quoter: config.contracts.v4Quoter,
        router: standard ? "uniswap-v4-universal" : "squeez-swap-router",
        universalRouter: standard ? config.v4Execution.universalRouter : null,
        permit2: standard ? config.v4Execution.permit2 : null,
        swapRouter: config.contracts.swapRouter,
        nativeInputIsCurrency0: BigInt(poolKey.currency0) === 0n,
        hookData: "0x",
      }, 15);
    }
    const externalQuoteMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/quote$/);
    if (req.method === "GET" && externalQuoteMatch) {
      const side = url.searchParams.get("side");
      const amountRaw = url.searchParams.get("amountWei") ?? "";
      const slippageBps = Number(url.searchParams.get("slippageBps") ?? "100");
      const deadlineSeconds = Number(url.searchParams.get("deadlineSeconds") ?? "600");
      if (side !== "buy" && side !== "sell") return json(res, 400, { error: "side must be buy or sell" });
      if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) {
        return json(res, 400, { error: "amountWei must be a positive base-unit integer" });
      }
      if (!Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps > 5_000) {
        return json(res, 400, { error: "slippageBps must be an integer between 0 and 5000" });
      }
      if (!Number.isSafeInteger(deadlineSeconds) || deadlineSeconds < 60 || deadlineSeconds > 3_600) {
        return json(res, 400, { error: "deadlineSeconds must be an integer between 60 and 3600" });
      }
      const recipientRaw = url.searchParams.get("recipient");
      if (recipientRaw !== null && !/^0x[a-fA-F0-9]{40}$/.test(recipientRaw)) {
        return json(res, 400, { error: "recipient must be an EVM address" });
      }
      const recipient = recipientRaw ? getAddress(recipientRaw) : null;
      if (recipient === "0x0000000000000000000000000000000000000000") {
        return json(res, 400, { error: "recipient must not be the zero address" });
      }
      const result = await pool.query(
        `select address, curve, pool, status from "${config.databaseSchema}"."token"
         where lower(address) = lower($1) limit 1`,
        [externalQuoteMatch[1]],
      );
      const token = result.rows[0];
      if (!token) return json(res, 404, { error: "Token not found" });
      if (token.status === "graduated") {
        return json(res, 409, {
          error: "Token has graduated; use its Uniswap v4 pool through a compatible router",
          venue: "uniswap-v4",
          pool: token.pool ? getAddress(token.pool) : null,
          poolKeyUrl: `${config.publicApiUrl.replace(/\/$/, "")}/v1/${config.chain}/${config.network}/tokens/${getAddress(token.address)}/pool`,
          swapRouter: config.contracts.swapRouter,
          universalRouter: standardRouterSupported() ? config.v4Execution.universalRouter : null,
        });
      }
      const amount = BigInt(amountRaw);
      const curve = getAddress(token.curve);
      const tokenAddress = getAddress(token.address);
      const deadline = BigInt(Math.floor(Date.now() / 1_000) + deadlineSeconds);
      if (side === "buy") {
        const call = encodeFunctionData({ abi: externalCurveAbi, functionName: "quoteBuy", args: [amount] });
        const raw = await rpc("eth_call", [{ to: curve, data: call }, "latest"]);
        const [expected, protocolFee, creatorFee, sniperTax] = decodeFunctionResult({
          abi: externalCurveAbi, functionName: "quoteBuy", data: raw as Hex,
        });
        const minimum = expected * BigInt(10_000 - slippageBps) / 10_000n;
        const readUint = async (functionName: "launchedAt" | "protectionPolicyId" | "protectionWindowSeconds"
          | "maxBuyBpsPerTransaction" | "maxBuyBpsPerAddress") => BigInt(await ethCall(
            curve, encodeFunctionData({ abi: curveLimitsAbi, functionName }),
          ));
        const [launchedAt, policyId, windowSeconds, bpsPerTx, bpsPerAddress, rawConfig, rawPurchased] =
          await Promise.all([
            readUint("launchedAt"), readUint("protectionPolicyId"), readUint("protectionWindowSeconds"),
            readUint("maxBuyBpsPerTransaction"), readUint("maxBuyBpsPerAddress"),
            ethCall(curve, encodeFunctionData({ abi: curveLimitsAbi, functionName: "config" })),
            recipient
              ? ethCall(curve, encodeFunctionData({ abi: curveLimitsAbi, functionName: "purchasedDuringProtection", args: [recipient] }))
              : Promise.resolve(null),
          ]);
        const curveConfig = decodeFunctionResult({ abi: curveLimitsAbi, functionName: "config", data: rawConfig });
        const now = BigInt(Math.floor(Date.now() / 1_000));
        const protectionUntil = policyId > 0n ? launchedAt + windowSeconds : null;
        const protectionActive = protectionUntil !== null && now < protectionUntil;
        const maxWalletUntil = launchedAt + BigInt(curveConfig[6]);
        const maxWalletActive = now < maxWalletUntil;
        const maxBuyPerTx = protectionActive ? TOTAL_SUPPLY_WEI * bpsPerTx / 10_000n : null;
        const maxBuyPerAddress = protectionActive ? TOTAL_SUPPLY_WEI * bpsPerAddress / 10_000n : null;
        const purchased = rawPurchased ? BigInt(rawPurchased) : null;
        const remainingForRecipient = maxBuyPerAddress !== null && purchased !== null
          ? (maxBuyPerAddress > purchased ? maxBuyPerAddress - purchased : 0n) : null;
        let willRevert: boolean | null = null;
        let revertReason: string | null = null;
        if (recipient) {
          const simulation = await simulateCurveCall({
            from: recipient, to: curve, value: amount,
            data: encodeFunctionData({ abi: externalCurveAbi, functionName: "buyTo", args: [recipient, minimum, deadline] }),
          });
          if (simulation.outcome === "success") willRevert = false;
          else if (simulation.outcome === "revert") { willRevert = true; revertReason = simulation.reason; }
        }
        // Static fallback so integrators still get a warning when the node cannot simulate.
        if (willRevert === null) {
          if (maxBuyPerTx !== null && expected > maxBuyPerTx) { willRevert = true; revertReason = "BuyLimitExceeded"; }
          else if (remainingForRecipient !== null && expected > remainingForRecipient) {
            willRevert = true; revertReason = "BuyLimitExceeded";
          }
        }
        return publicJson(res, 200, {
          schema: "squeez.execution-quote.v1", chainId: config.chainId, venue: "squeez-curve",
          token: tokenAddress, curve, side, input: { asset: "native", amount: amount.toString() },
          expectedOutput: { asset: tokenAddress, amount: expected.toString() },
          minimumOutput: minimum.toString(),
          fees: { protocol: protocolFee.toString(), creator: creatorFee.toString(), sniperTax: sniperTax.toString() },
          limits: {
            protectionActiveUntil: protectionActive ? protectionUntil!.toString() : null,
            maxBuyPerTx: maxBuyPerTx?.toString() ?? null,
            maxBuyPerAddress: maxBuyPerAddress?.toString() ?? null,
            remainingForRecipient: remainingForRecipient?.toString() ?? null,
            maxWalletActiveUntil: maxWalletActive ? maxWalletUntil.toString() : null,
            maxWallet: maxWalletActive ? (TOTAL_SUPPLY_WEI * BigInt(curveConfig[5]) / 10_000n).toString() : null,
          },
          willRevert, revertReason,
          slippageBps, deadline: deadline.toString(),
          approval: null,
          transaction: {
            to: curve,
            data: recipient
              ? encodeFunctionData({ abi: externalCurveAbi, functionName: "buyTo", args: [recipient, minimum, deadline] })
              : encodeFunctionData({ abi: externalCurveAbi, functionName: "buy", args: [minimum, deadline] }),
            value: amount.toString(),
          },
        }, 5);
      }
      const call = encodeFunctionData({ abi: externalCurveAbi, functionName: "quoteSell", args: [amount] });
      const raw = await rpc("eth_call", [{ to: curve, data: call }, "latest"]);
      const [expected, protocolFee, creatorFee] = decodeFunctionResult({
        abi: externalCurveAbi, functionName: "quoteSell", data: raw as Hex,
      });
      const minimum = expected * BigInt(10_000 - slippageBps) / 10_000n;
      return publicJson(res, 200, {
        schema: "squeez.execution-quote.v1", chainId: config.chainId, venue: "squeez-curve",
        token: tokenAddress, curve, side, input: { asset: tokenAddress, amount: amount.toString() },
        expectedOutput: { asset: "native", amount: expected.toString() },
        minimumOutput: minimum.toString(),
        fees: { protocol: protocolFee.toString(), creator: creatorFee.toString(), sniperTax: "0" },
        slippageBps, deadline: deadline.toString(),
        approval: {
          to: tokenAddress,
          data: encodeFunctionData({ abi: externalErc20Abi, functionName: "approve", args: [curve, amount] }),
          value: "0",
          spender: curve,
          amount: amount.toString(),
        },
        transaction: {
          to: curve,
          data: recipient
            ? encodeFunctionData({ abi: externalCurveAbi, functionName: "sellTo", args: [amount, minimum, deadline, recipient] })
            : encodeFunctionData({ abi: externalCurveAbi, functionName: "sell", args: [amount, minimum, deadline] }),
          value: "0",
        },
      }, 5);
    }
    const holdersMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/holders$/);
    if (req.method === "GET" && holdersMatch) {
      try {
        const result = await pool.query(
          `select account, balance::text as balance, updated_at as "updatedAt", block_number as "blockNumber"
           from "${config.databaseSchema}"."holder_balance"
           where lower(token) = lower($1) and balance > 0
           order by balance desc limit 100`,
          [holdersMatch[1]],
        );
        return json(res, 200, result.rows.map(chainQualified));
      } catch (cause) {
        if ((cause as { code?: string }).code === "42P01") return json(res, 503, { error: "Holder indexing is not ready" });
        throw cause;
      }
    }
    const metadataMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/metadata$/);
    if (req.method === "GET" && metadataMatch) {
      const record = await pool.query(
        `select metadata_uri as "metadataUri" from "${config.databaseSchema}"."token" where lower(address) = lower($1) limit 1`,
        [metadataMatch[1]],
      );
      const indexedUri = record.rows[0]?.metadataUri as string | undefined;
      const uri = /^ipfs:\/\/[a-zA-Z0-9]+$/.test(indexedUri ?? "")
        ? indexedUri
        : await onchainMetadataUri(getAddress(metadataMatch[1]));
      const cid = uri?.match(/^ipfs:\/\/([a-zA-Z0-9]+)$/)?.[1];
      if (!cid) return json(res, 404, { error: "Token metadata is unavailable" });
      const response = await fetch(`${config.pinata.gatewayUrl}/${cid}`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return json(res, 502, { error: "Metadata gateway unavailable" });
      const payload = await response.json() as Record<string, unknown>;
      const imageCid = typeof payload.image === "string" ? payload.image.match(/^ipfs:\/\/([a-zA-Z0-9]+)$/)?.[1] : undefined;
      const rawLinks = typeof payload.links === "object" && payload.links ? payload.links as Record<string, unknown> : {};
      return json(res, 200, {
        chainId: config.chainId,
        schema: payload.schema === "squeez.token.v1" || payload.schema === "squeez.token.v2" ? payload.schema : null,
        description: safeMetadataText(payload.description, 280),
        links: {
          website: safeMetadataUrl(rawLinks.website),
          x: safeMetadataUrl(rawLinks.x),
          telegram: safeMetadataUrl(rawLinks.telegram),
        },
        imagePath: imageCid ? `/v1/${config.chain}/${config.network}/ipfs/${imageCid}` : null,
      });
    }
    const logoMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/logo$/);
    if (req.method === "GET" && logoMatch) {
      const record = await pool.query(
        `select metadata_uri as "metadataUri" from "${config.databaseSchema}"."token"
         where lower(address) = lower($1) limit 1`,
        [logoMatch[1]],
      );
      const indexedUri = record.rows[0]?.metadataUri as string | undefined;
      const uri = /^ipfs:\/\/[a-zA-Z0-9]+$/.test(indexedUri ?? "")
        ? indexedUri
        : await onchainMetadataUri(getAddress(logoMatch[1]));
      const metadataCid = uri?.match(/^ipfs:\/\/([a-zA-Z0-9]+)$/)?.[1];
      if (!metadataCid) return json(res, 404, { error: "Token metadata is unavailable" });
      const metadataResponse = await fetch(`${config.pinata.gatewayUrl}/${metadataCid}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!metadataResponse.ok) return json(res, 502, { error: "Metadata gateway unavailable" });
      const metadata = await metadataResponse.json() as Record<string, unknown>;
      const imageCid = typeof metadata.image === "string"
        ? metadata.image.match(/^ipfs:\/\/([a-zA-Z0-9]+)$/)?.[1]
        : undefined;
      if (!imageCid) return json(res, 404, { error: "Token logo is unavailable" });
      const imageResponse = await fetch(`${config.pinata.gatewayUrl}/${imageCid}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!imageResponse.ok) return json(res, 502, { error: "Logo gateway unavailable" });
      const contentType = imageResponse.headers.get("content-type")?.split(";")[0] ?? "";
      if (!imageTypes.has(contentType)) return json(res, 415, { error: "Unsupported asset type" });
      const bytes = await imageResponse.arrayBuffer();
      if (bytes.byteLength > 5_000_000) return json(res, 413, { error: "Asset is too large" });
      const normalizedLogo = await sharp(Buffer.from(bytes), { animated: false })
        .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(normalizedLogo.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*",
      });
      res.end(normalizedLogo);
      return;
    }
    const ipfsMatch = url.pathname.match(/^\/v1\/ipfs\/([a-zA-Z0-9]+)$/);
    if (req.method === "GET" && ipfsMatch) {
      const response = await fetch(`${config.pinata.gatewayUrl}/${ipfsMatch[1]}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return json(res, 502, { error: "IPFS gateway unavailable" });
      const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
      if (!imageTypes.has(contentType)) return json(res, 415, { error: "Unsupported asset type" });
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 5_000_000) return json(res, 413, { error: "Asset is too large" });
      res.writeHead(200, { "content-type": contentType, "content-length": String(bytes.byteLength), "cache-control": "public, max-age=31536000, immutable" });
      res.end(Buffer.from(bytes));
      return;
    }
    const tradesMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/trades$/);
    if (req.method === "GET" && tradesMatch) {
      const result = await pool.query(
        `select id, token, trader, is_buy as "isBuy", hype_amount as "hypeAmount",
          token_amount as "tokenAmount", source, hype_raised as "hypeRaised", timestamp,
          tx_hash as "txHash", block_number as "blockNumber", log_index as "logIndex"
         from "${config.databaseSchema}"."trade" where lower(token) = lower($1)
         order by block_number desc, log_index desc limit 100`,
        [tradesMatch[1]],
      );
      return json(res, 200, result.rows.map(chainQualified));
    }
    const feesMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/fees$/);
    if (req.method === "GET" && feesMatch) {
      const result = await pool.query(
        `select id, token, asset, kind, recipient, amount, timestamp, tx_hash as "txHash",
          block_number as "blockNumber", log_index as "logIndex"
         from "${config.databaseSchema}"."creator_fee" where lower(token) = lower($1)
         order by block_number desc, log_index desc limit 100`,
        [feesMatch[1]],
      );
      return json(res, 200, result.rows.map(chainQualified));
    }
    const tokenMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})$/);
    if (req.method === "GET" && tokenMatch) {
      const columns = await tokenColumns();
      const result = await pool.query(`select ${columns} from "${config.databaseSchema}"."token" where lower(address) = lower($1) limit 1`, [tokenMatch[1]]);
      return result.rows[0] ? json(res, 200, chainQualified(result.rows[0])) : json(res, 404, { error: "Token not found" });
    }
    if (req.method === "POST" && (url.pathname === "/rpc" || url.pathname === "/v1/rpc")) {
      const payload = await body(req) as { method?: string };
      if (!payload.method || !safeRpcMethods.has(payload.method)) return json(res, 403, { error: "RPC method not allowed" });
      try {
        const result = await rpc(payload.method, (payload as { params?: unknown[] }).params ?? []);
        return json(res, 200, { jsonrpc: "2.0", id: (payload as { id?: unknown }).id ?? 1, result });
      } catch (error) {
        return json(res, 502, { error: error instanceof Error ? error.message : "RPC providers unavailable" });
      }
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Internal server error" });
  }
});

server.listen(config.port, "0.0.0.0", () => console.log(
  `Squeez API listening on :${config.port} (${config.chain}:${config.network}, chain ${config.chainId})`,
));

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Squeez API shutting down gracefully");
  const forcedExit = setTimeout(() => process.exit(1), 25_000);
  forcedExit.unref();
  server.close(async (error) => {
    try {
      await pool.end();
      process.exit(error ? 1 : 0);
    } catch (cause) {
      console.error("Squeez API shutdown failed", cause);
      process.exit(1);
    }
  });
  server.closeIdleConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
