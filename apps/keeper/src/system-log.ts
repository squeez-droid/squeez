import { Pool } from "pg";
import type { LogEvent } from "@squeez/shared";
import type { KeeperConfig } from "./config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

export function logKeeper(cfg: KeeperConfig, requestId: string, event: LogEvent,
  level: "info" | "warn" | "error" = "info", message?: string) {
  console.log(JSON.stringify({ event, level, requestId, message, chainId: cfg.chainId }));
  void pool.query(
    `insert into "${cfg.network}_system".system_log
      (source, level, event, message, chain_id, request_id, context)
     values ('keeper',$1,$2,$3,$4,$5,$6)`,
    [level, event, message ?? null, cfg.chainId, requestId, { feeVault: cfg.feeVault }],
  ).catch((error: unknown) => console.error(JSON.stringify({ event: "system_log.write_failed", targetEvent: event,
    error: error instanceof Error ? error.message : "unknown" })));
}
