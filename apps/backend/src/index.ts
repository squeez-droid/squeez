import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { formatEther, getAddress, verifyMessage, type Address, type Hex } from "viem";
import { LOG_EVENTS, WEB_LOG_EVENTS, type LogEvent } from "@squeez/shared";
import { backendConfig as config } from "./config.js";
import { writeSystemLog } from "./logger.js";
import { pinLaunchMetadata } from "./pinata.js";

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
const safeRpcMethods = new Set([
  "eth_blockNumber", "eth_call", "eth_chainId", "eth_estimateGas", "eth_feeHistory", "eth_gasPrice",
  "eth_getBalance", "eth_getBlockByHash", "eth_getBlockByNumber", "eth_getCode", "eth_getLogs",
  "eth_getTransactionByHash", "eth_getTransactionCount", "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas",
]);

function cors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin && !config.allowedOrigins.has(origin)) {
    res.writeHead(403).end("Origin not allowed");
    return false;
  }
  if (origin) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  return true;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
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
const imageTypes = new Map([
  ["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"],
]);

function uploadMessage(address: string, nonce: string, expiresAt: number): string {
  return `Squeez metadata upload\nWallet: ${address}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
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

const tokenColumns = `address, curve, creator, quote,
  creator_fee_bps as "creatorFeeBps", fee_recipient as "feeRecipient",
  fee_destination_kind as "feeDestinationKind", buyback_bps as "buybackBps",
  launch_config_id as "launchConfigId", name, symbol, metadata_uri as "metadataUri", status,
  case when status = 'graduated' then 'uniswap-v4' else 'curve' end as venue, pool,
  created_at as "createdAt", launch_tx_hash as "launchTxHash",
  launch_block_number as "launchBlockNumber", launch_log_index as "launchLogIndex"`;

async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(config.rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`RPC returned ${response.status}`);
  const payload = await response.json() as { result?: string; error?: { message?: string } };
  if (!payload.result) throw new Error(payload.error?.message ?? "RPC response is missing a result");
  return payload.result;
}

const server = createServer(async (req, res) => {
  try {
    if (!cors(req, res)) return;
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, network: config.network });
    }
    if (req.method === "GET" && url.pathname === "/v1/status") {
      const checkedAt = Math.floor(Date.now() / 1000);
      const [rpcResult, indexerResult] = await Promise.allSettled([
        rpc("eth_blockNumber"),
        pool.query(`select
          substring(latest_checkpoint from 27 for 16)::bigint as "blockNumber",
          substring(latest_checkpoint from 1 for 10)::bigint as "updatedAt"
          from "${config.databaseSchema}"._ponder_checkpoint where chain_id = $1 limit 1`, [config.chainId]),
      ]);
      const rpcBlock = rpcResult.status === "fulfilled" ? Number(BigInt(rpcResult.value)) : null;
      const indexed = indexerResult.status === "fulfilled" ? indexerResult.value.rows[0] : null;
      const indexerBlock = indexed ? Number(indexed.blockNumber) : null;
      const indexerUpdatedAt = indexed ? Number(indexed.updatedAt) : null;
      const lagBlocks = rpcBlock !== null && indexerBlock !== null ? Math.max(0, rpcBlock - indexerBlock) : null;
      const stale = lagBlocks === null || lagBlocks > 2_000 || (indexerUpdatedAt !== null && checkedAt - indexerUpdatedAt > 300);
      return json(res, rpcBlock !== null ? 200 : 503, {
        network: config.network, checkedAt, rpc: { ok: rpcBlock !== null, blockNumber: rpcBlock },
        indexer: { ok: indexerBlock !== null, blockNumber: indexerBlock, updatedAt: indexerUpdatedAt, lagBlocks, stale },
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
      void writeSystemLog(pool, config.network, { source: "web", event: LOG_EVENTS.metadataNonceIssued,
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
      void writeSystemLog(pool, config.network, { source: "web", event: LOG_EVENTS.metadataUploadRequested,
        wallet: address, chainId: config.chainId, requestId: auth.requestId });

      const imageData = cleanString(payload.image, 7_100_000, true);
      const match = imageData.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json(res, 400, { error: "Image must be PNG, JPEG, WebP, or GIF" });
      const image = Buffer.from(match[2], "base64");
      if (!image.length || image.length > 5 * 1024 * 1024) return json(res, 400, { error: "Image exceeds 5 MiB" });
      const symbol = cleanString(payload.symbol, 16, true).toUpperCase();
      if (!/^[A-Z0-9]{2,16}$/.test(symbol)) return json(res, 400, { error: "Invalid token symbol" });
      try {
        const result = await pinLaunchMetadata({
          image, imageMime: match[1], imageExtension: imageTypes.get(match[1])!,
          name: cleanString(payload.name, 64, true), symbol,
          description: cleanString(payload.description, 280), website: cleanUrl(payload.website),
          x: cleanUrl(payload.x), telegram: cleanUrl(payload.telegram),
        });
        void writeSystemLog(pool, config.network, { source: "web", event: LOG_EVENTS.metadataUploadSucceeded,
          wallet: address, chainId: config.chainId, requestId: auth.requestId,
          context: { imageUri: result.imageUri, metadataUri: result.metadataUri } });
        return json(res, 201, { ...result, requestId: auth.requestId });
      } catch (error) {
        void writeSystemLog(pool, config.network, { source: "web", level: "error",
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
      void writeSystemLog(pool, config.network, {
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
        network: config.network,
        chain: { id: config.chainId, name: config.network === "mainnet" ? "Elysium" : "Elysium Testnet", explorer: config.explorer },
        contracts: config.contracts,
        v4Pool: config.v4Pool,
        launchConfig,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/tokens") {
      const result = await pool.query(`select ${tokenColumns} from "${config.databaseSchema}"."token" order by "createdAt" desc limit 100`);
      return json(res, 200, result.rows);
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
      return json(res, 200, result.rows);
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
      return json(res, 200, result.rows);
    }
    const tokenMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})$/);
    if (req.method === "GET" && tokenMatch) {
      const result = await pool.query(`select ${tokenColumns} from "${config.databaseSchema}"."token" where lower(address) = lower($1) limit 1`, [tokenMatch[1]]);
      return result.rows[0] ? json(res, 200, result.rows[0]) : json(res, 404, { error: "Token not found" });
    }
    if (req.method === "POST" && url.pathname === "/rpc") {
      const payload = await body(req) as { method?: string };
      if (!payload.method || !safeRpcMethods.has(payload.method)) return json(res, 403, { error: "RPC method not allowed" });
      const upstream = await fetch(config.rpcUrl, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
      });
      return json(res, upstream.status, await upstream.json());
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "Internal server error" });
  }
});

server.listen(config.port, "0.0.0.0", () => console.log(`Squeez API listening on :${config.port} (${config.network})`));

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
