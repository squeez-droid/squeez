import type { Pool } from "pg";
import type { LogEvent } from "@squeez/shared";

export interface SystemLog {
  source: "web" | "indexer" | "keeper" | "contracts" | "admin";
  level?: "debug" | "info" | "warn" | "error";
  event: LogEvent;
  message?: string;
  wallet?: string;
  token?: string;
  txHash?: string;
  chainId?: number;
  blockNumber?: bigint;
  requestId?: string;
  context?: Record<string, string | number | boolean | null>;
}

export async function writeSystemLog(pool: Pool, network: "testnet" | "mainnet", entry: SystemLog) {
  const printable = { ...entry, context: entry.context ?? {} };
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...printable }));
  try {
    await pool.query(
      `insert into "${network}_system".system_log
        (source, level, event, message, wallet, token, tx_hash, chain_id, block_number, request_id, context)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [entry.source, entry.level ?? "info", entry.event, entry.message ?? null, entry.wallet ?? null,
        entry.token ?? null, entry.txHash ?? null, entry.chainId ?? null, entry.blockNumber ?? null,
        entry.requestId ?? null, entry.context ?? {}],
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "system_log.write_failed", targetEvent: entry.event,
      error: error instanceof Error ? error.message : "unknown" }));
  }
}
