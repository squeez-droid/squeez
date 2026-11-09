import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import { backendConfig as config } from "./config.js";

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

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128_000) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const tokenColumns = `address, curve, creator, quote, "creatorFeeBps", "feeRecipient", "feeDestinationKind",
  "buybackBps", "launchConfigId", name, symbol, "metadataUri", status, pool, "createdAt", "launchTxHash",
  "launchBlockNumber", "launchLogIndex"`;

const server = createServer(async (req, res) => {
  try {
    if (!cors(req, res)) return;
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, network: config.network });
    }
    if (req.method === "GET" && url.pathname === "/v1/config") {
      const configured = Object.values(config.contracts).every(Boolean)
        && Object.values(config.launchConfig).every(Boolean);
      return json(res, 200, {
        configured,
        network: config.network,
        chain: { id: config.chainId, name: config.network === "mainnet" ? "Elysium" : "Elysium Testnet", explorer: config.explorer },
        contracts: config.contracts,
        launchConfig: config.launchConfig,
      });
    }
    if (req.method === "GET" && url.pathname === "/v1/tokens") {
      const result = await pool.query(`select ${tokenColumns} from "${config.databaseSchema}"."token" order by "createdAt" desc limit 100`);
      return json(res, 200, result.rows);
    }
    const tradesMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/trades$/);
    if (req.method === "GET" && tradesMatch) {
      const result = await pool.query(
        `select id, token, trader, "isBuy", "hypeAmount", "tokenAmount", source, "hypeRaised", timestamp,
          "txHash", "blockNumber", "logIndex"
         from "${config.databaseSchema}"."trade" where lower(token) = lower($1)
         order by "blockNumber" desc, "logIndex" desc limit 100`,
        [tradesMatch[1]],
      );
      return json(res, 200, result.rows);
    }
    const feesMatch = url.pathname.match(/^\/v1\/tokens\/(0x[a-fA-F0-9]{40})\/fees$/);
    if (req.method === "GET" && feesMatch) {
      const result = await pool.query(
        `select id, token, asset, kind, recipient, amount, timestamp, "txHash", "blockNumber", "logIndex"
         from "${config.databaseSchema}"."creator_fee" where lower(token) = lower($1)
         order by "blockNumber" desc, "logIndex" desc limit 100`,
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
