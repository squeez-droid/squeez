import { randomUUID } from "node:crypto";
import { LOG_EVENTS } from "@squeez/shared";
import { loadConfig } from "./config";
import { runBuybackTick } from "./buyback";
import { logKeeper } from "./system-log";

const cfg = loadConfig();
console.log(`[keeper] started on ${cfg.network}, interval ${cfg.intervalMs / 1000}s`);

async function loop() {
  const requestId = randomUUID();
  logKeeper(cfg, requestId, LOG_EVENTS.keeperTickStarted);
  try {
    const executed = await runBuybackTick(cfg);
    logKeeper(
      cfg,
      requestId,
      executed ? LOG_EVENTS.keeperTickSucceeded : LOG_EVENTS.keeperTickSkipped,
      executed ? "info" : "warn",
      executed ? undefined : "Buyback contract path is not deployed",
    );
  } catch (err) {
    console.error("[keeper] tick failed", err);
    logKeeper(cfg, requestId, LOG_EVENTS.keeperTickFailed, "error", err instanceof Error ? err.message : "unknown");
  }
  setTimeout(loop, cfg.intervalMs);
}

loop();
