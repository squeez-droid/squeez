#!/usr/bin/env node

import { createPublicClient, http, zeroAddress } from "viem";

const rpc = process.env.SQUEEZ_RPC_FALLBACK?.trim();
if (!rpc) throw new Error("SQUEEZ_RPC_FALLBACK is required");
const range = Number(process.argv[2] || "2000");
if (!Number.isSafeInteger(range) || range < 1) throw new Error("Range must be a positive integer");

const client = createPublicClient({ transport: http(rpc, { timeout: 30_000 }) });
const head = await client.getBlockNumber();
const fromBlock = head - BigInt(range - 1);
await client.getLogs({ address: zeroAddress, fromBlock, toBlock: head });
console.log(JSON.stringify({ ok: true, provider: new URL(rpc).hostname, range, fromBlock: Number(fromBlock), toBlock: Number(head) }, null, 2));
