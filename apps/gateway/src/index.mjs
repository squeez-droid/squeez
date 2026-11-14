import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { isReadOnlyRequestAllowed, readTargets, resolveUpstream } from "./routing.mjs";

const port = Number(process.env.PORT || 8080);
const targets = readTargets(process.env);
const maxBodyBytes = Number(process.env.GATEWAY_MAX_BODY_BYTES || 8_000_000);
const requestsPerMinute = Number(process.env.GATEWAY_REQUESTS_PER_MINUTE || 300);
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
const rateWindows = new Map();
const exploreCache = new Map();
if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) throw new Error("GATEWAY_MAX_BODY_BYTES is invalid");
if (!Number.isSafeInteger(requestsPerMinute) || requestsPerMinute <= 0) throw new Error("GATEWAY_REQUESTS_PER_MINUTE is invalid");

function json(res, status, value) {
  if (!res.hasHeader("cache-control")) res.setHeader("cache-control", "no-store");
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function cors(req, res) {
  const origin = req.headers.origin;
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  // Browsers preflight non-simple requests (for example a JSON content-type) with OPTIONS before the GET.
  const publicDiscoveryRoute = (req.method === "GET" || req.method === "OPTIONS") && (
    pathname === "/v1/explore"
    ||
    /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/token-?list\.json$/.test(pathname)
    || /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/tokens\/0x[a-fA-F0-9]{40}\/logo$/.test(pathname)
    || /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/integrations\/launchpad\.json$/.test(pathname)
    || /^\/v1\/(?:elysium|hyperevm|robinhood)\/(?:testnet|mainnet)\/tokens\/0x[a-fA-F0-9]{40}\/(?:route|quote|pool)$/.test(pathname)
  );
  if (publicDiscoveryRoute) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type,x-request-id");
    res.setHeader("access-control-max-age", "86400");
    return true;
  }
  if (origin && !allowedOrigins.has(origin)) {
    json(res, 403, { error: "Origin not allowed" });
    return false;
  }
  if (origin) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-headers", "content-type,x-request-id");
  res.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("access-control-allow-credentials", "true");
  return true;
}

const EXPLORE_CHAINS = new Set(["elysium", "hyperevm", "robinhood"]);
const EXPLORE_STAGES = new Set(["testnet", "mainnet"]);

async function aggregateExplore(url) {
  const stage = url.searchParams.get("network") || "mainnet";
  if (!EXPLORE_STAGES.has(stage)) throw Object.assign(new Error("Invalid network filter"), { status: 400 });
  const requested = (url.searchParams.get("chains") || "all").split(",").map((value) => value.trim()).filter(Boolean);
  const chains = requested.includes("all") ? [...EXPLORE_CHAINS] : [...new Set(requested)];
  if (!chains.length || chains.some((chain) => !EXPLORE_CHAINS.has(chain))) {
    throw Object.assign(new Error("Invalid chain filter"), { status: 400 });
  }
  const cacheKey = `${stage}:${chains.slice().sort().join(",")}`;
  const cached = exploreCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const candidates = targets.filter((target) => target.stage === stage
    && chains.includes(target.chain)
    && target.upstream
    && ["enabled", "read-only"].includes(target.capability));
  const results = await Promise.all(candidates.map(async (target) => {
    const base = `${target.upstream}/v1/${target.chain}/${target.stage}`;
    try {
      const [tokensResponse, statsResponse, configResponse] = await Promise.all([
        fetch(`${base}/tokens`, { signal: AbortSignal.timeout(6_000) }),
        fetch(`${base}/stats`, { signal: AbortSignal.timeout(6_000) }),
        fetch(`${base}/config`, { signal: AbortSignal.timeout(6_000) }),
      ]);
      if (!tokensResponse.ok || !statsResponse.ok || !configResponse.ok) throw new Error("Target discovery request failed");
      const [tokens, stats, config] = await Promise.all([tokensResponse.json(), statsResponse.json(), configResponse.json()]);
      const targetInfo = {
        chain: target.chain,
        stage: target.stage,
        chainId: target.chainId,
        capability: target.capability,
        nativeSymbol: config?.chain?.nativeCurrency?.symbol || (target.chain === "robinhood" ? "ETH" : "HYPE"),
        explorer: config?.chain?.explorer || "",
        graduationThreshold: config?.launchConfig?.graduationThresholdHype || null,
      };
      return { ok: true, target: target.id, targetInfo, stats, tokens: Array.isArray(tokens)
        ? tokens.map((token) => ({ ...token, target: targetInfo })) : [] };
    } catch (error) {
      return { ok: false, target: target.id, error: error instanceof Error ? error.message : "Target unavailable" };
    }
  }));
  const healthy = results.filter((result) => result.ok);
  const value = {
    network: stage,
    chains,
    generatedAt: new Date().toISOString(),
    targets: {
      healthy: healthy.map((result) => ({ ...result.targetInfo, id: result.target, stats: result.stats })),
      degraded: results.filter((result) => !result.ok).map((result) => ({ id: result.target, error: result.error })),
      unavailable: chains.filter((chain) => !candidates.some((target) => target.chain === chain)),
    },
    tokens: healthy.flatMap((result) => result.tokens),
  };
  exploreCache.set(cacheKey, { value, expiresAt: Date.now() + 15_000 });
  return value;
}

function rateLimit(req, res, targetId) {
  const now = Date.now();
  const address = req.socket.remoteAddress || "unknown";
  const key = `${targetId}:${address}`;
  const current = rateWindows.get(key);
  const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
  window.count += 1;
  rateWindows.set(key, window);
  res.setHeader("x-ratelimit-limit", String(requestsPerMinute));
  res.setHeader("x-ratelimit-remaining", String(Math.max(0, requestsPerMinute - window.count)));
  res.setHeader("x-ratelimit-reset", String(Math.ceil(window.resetAt / 1000)));
  if (window.count > requestsPerMinute) {
    json(res, 429, { error: "Rate limit exceeded", target: targetId });
    return false;
  }
  if (rateWindows.size > 10_000) {
    for (const [entryKey, entry] of rateWindows) if (entry.resetAt <= now) rateWindows.delete(entryKey);
  }
  return true;
}

async function requestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

const server = createServer(async (req, res) => {
  const requestId = req.headers["x-request-id"]?.toString() || randomUUID();
  res.setHeader("x-request-id", requestId);
  try {
    if (!cors(req, res)) return;
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health/live") return json(res, 200, { live: true });
    if (req.method === "GET" && url.pathname === "/v1/deployments") {
      return json(res, 200, targets.map(({ upstream: _upstream, ...target }) => ({
        ...target, apiBasePath: `/v1/${target.chain}/${target.stage}`,
      })));
    }
    if (req.method === "GET" && url.pathname === "/v1/explore") {
      if (!rateLimit(req, res, "explore")) return;
      res.setHeader("cache-control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
      return json(res, 200, await aggregateExplore(url));
    }
    if (req.method === "GET" && url.pathname === "/health/ready") {
      const served = targets.filter((target) => target.upstream && target.capability !== "coming-soon");
      const checks = await Promise.all(served.map(async (target) => {
        try {
          const [healthResponse, readinessResponse] = await Promise.all([
            fetch(`${target.upstream}/v1/${target.chain}/${target.stage}/health`, {
              signal: AbortSignal.timeout(4_000),
            }),
            fetch(`${target.upstream}/v1/${target.chain}/${target.stage}/ready`, {
              signal: AbortSignal.timeout(4_000),
            }),
          ]);
          return { target: target.id, ready: healthResponse.ok, dataReady: readinessResponse.ok };
        } catch { return { target: target.id, ready: false, dataReady: false }; }
      }));
      const ready = checks.every((check) => check.ready);
      return json(res, ready ? 200 : 503, { ready, targets: checks });
    }

    const resolved = resolveUpstream(url.pathname, targets);
    if (resolved.kind === "unmatched") return json(res, 404, { error: "Target-qualified API path is required" });
    if (resolved.kind === "unavailable") {
      return json(res, resolved.status, {
        error: resolved.status === 503 ? "Deployment target is under maintenance" : "Deployment target is unavailable",
        target: resolved.target?.id ?? null,
      });
    }
    if (!rateLimit(req, res, resolved.target.id)) return;
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (resolved.target.capability === "read-only"
      && !isReadOnlyRequestAllowed(req.method || "GET", url.pathname)) {
      return json(res, 403, { error: "Deployment target is read-only", target: resolved.target.id });
    }

    const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await requestBody(req);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (!value || ["host", "connection", "content-length"].includes(name.toLowerCase())) continue;
      headers.set(name, Array.isArray(value) ? value.join(",") : value);
    }
    headers.set("x-request-id", requestId);
    headers.set("x-squeez-target", resolved.target.id);
    const upstream = await fetch(`${resolved.target.upstream}${url.pathname}${url.search}`, {
      method: req.method, headers, body, redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders = {};
    upstream.headers.forEach((value, name) => {
      if (!["connection", "transfer-encoding", "content-encoding"].includes(name.toLowerCase())) responseHeaders[name] = value;
    });
    res.writeHead(upstream.status, responseHeaders);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error(JSON.stringify({ event: "gateway.request_failed", requestId, message: error instanceof Error ? error.message : "unknown" }));
    json(res, error?.status || 502, { error: error?.status === 413 ? error.message : "Upstream service unavailable", requestId });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Squeez API gateway listening on :${port}`));

function shutdown() {
  server.close((error) => process.exit(error ? 1 : 0));
  server.closeIdleConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
