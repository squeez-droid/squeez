#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const useRpcFallback = args[0] === "--rpc-fallback";
const command = useRpcFallback ? args.slice(1) : args;
if (command.length === 0) throw new Error("A command is required");

const text = readFileSync(".env.migration", "utf8");
const line = text.split(/\r?\n/).find((value) => value.trim().startsWith("TARGET_DATABASE_URL="));
const targetDatabaseUrl = line?.slice(line.indexOf("=") + 1).trim().replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
if (!targetDatabaseUrl) throw new Error("TARGET_DATABASE_URL is required in .env.migration");

const url = new URL(targetDatabaseUrl);
const projectRef = decodeURIComponent(url.username).split(".")[1];
const expectedRef = text.match(/^TARGET_SUPABASE_PROJECT_REF=(.+)$/m)?.[1]?.trim();
if (!projectRef || !expectedRef || projectRef !== expectedRef) {
  throw new Error(`Target project mismatch: expected ${expectedRef || "configured project ref"}, received ${projectRef || "unknown"}`);
}

const child = spawn(command[0], command.slice(1), {
  env: {
    ...process.env,
    DATABASE_URL: targetDatabaseUrl,
    SQUEEZ_MIGRATION_FULL_HISTORY: "true",
    // Historical rebuilds should be gentle on free-tier RPCs. These values only
    // apply to this migration wrapper and do not change production services.
    INDEXER_MAX_REQUESTS_PER_SECOND: process.env.MIGRATION_INDEXER_MAX_REQUESTS_PER_SECOND?.trim() || "1",
    INDEXER_LOG_BLOCK_RANGE: process.env.MIGRATION_INDEXER_LOG_BLOCK_RANGE?.trim() || "10",
    ...(useRpcFallback ? { SQUEEZ_RPC_SELECTION: "fallback" } : {}),
  },
  shell: false,
  stdio: "inherit",
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
