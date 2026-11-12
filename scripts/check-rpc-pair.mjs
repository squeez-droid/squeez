const primary = process.env.SQUEEZ_RPC?.trim();
const fallback = process.env.SQUEEZ_RPC_FALLBACK?.trim();
const expectedChainId = Number(process.env.SQUEEZ_CHAIN_ID);
if (!primary || !fallback) throw new Error("SQUEEZ_RPC and SQUEEZ_RPC_FALLBACK are required");
if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) throw new Error("SQUEEZ_CHAIN_ID is invalid");
if (new URL(primary).hostname === new URL(fallback).hostname) throw new Error("RPC providers must use independent hosts");

async function call(url, method, params = []) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw Object.assign(new Error(`${new URL(url).hostname}: HTTP ${response.status}`), {
        retryable: response.status === 429 || response.status >= 500,
      });
      const body = await response.json();
      if (body.error) throw new Error(`${new URL(url).hostname}: ${body.error.message ?? "RPC error"}`);
      return { result: body.result, latencyMs: Date.now() - startedAt, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === 5 || error?.retryable === false) break;
      await wait(attempt * 1_000);
    }
  }
  throw lastError;
}

async function inspect(label, url) {
  const chain = await call(url, "eth_chainId");
  const block = await call(url, "eth_blockNumber");
  const chainId = Number(BigInt(chain.result));
  if (chainId !== expectedChainId) throw new Error(`${label} chain mismatch: ${chainId}`);
  return {
    label,
    host: new URL(url).hostname,
    chainId,
    blockNumber: Number(BigInt(block.result)),
    latencyMs: Math.max(chain.latencyMs, block.latencyMs),
    attempts: Math.max(chain.attempts, block.attempts),
  };
}

const primaryResult = await inspect("primary", primary);
const fallbackResult = await inspect("fallback", fallback);
const blockDelta = Math.abs(primaryResult.blockNumber - fallbackResult.blockNumber);
if (blockDelta > 50) throw new Error(`RPC providers disagree by ${blockDelta} blocks`);
console.log(JSON.stringify({ ready: true, blockDelta, providers: [primaryResult, fallbackResult] }, null, 2));
import { setTimeout as wait } from "node:timers/promises";

