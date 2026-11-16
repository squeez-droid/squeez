import { randomUUID } from "node:crypto";
import { LOG_EVENTS } from "@squeez/shared";
import { loadConfig } from "./config";
import { runBuybackTick } from "./buyback";
import { logKeeper } from "./system-log";
import { createGraduationKeeper } from "./graduation";

const cfg = loadConfig();
const graduation = createGraduationKeeper(cfg);
console.log(`[keeper] started on ${cfg.chain}:${cfg.network}, account ${graduation.account}, interval ${cfg.intervalMs / 1000}s`);

let running = false;

async function loop() {
  if (running) return;
  running = true;
  const requestId = randomUUID();
  logKeeper(cfg, requestId, LOG_EVENTS.keeperTickStarted);
  try {
    const graduationHashes = await graduation.tick();
    const buybackExecuted = await runBuybackTick(cfg);
    const executed = graduationHashes.length > 0 || buybackExecuted;
    logKeeper(
      cfg,
      requestId,
      executed ? LOG_EVENTS.keeperTickSucceeded : LOG_EVENTS.keeperTickSkipped,
      executed ? "info" : "warn",
      executed ? undefined : "No pending graduation or buyback action",
      { context: { graduations: graduationHashes } },
    );
  } catch (err) {
    console.error("[keeper] tick failed", err);
    logKeeper(cfg, requestId, LOG_EVENTS.keeperTickFailed, "error", err instanceof Error ? err.message : "unknown");
  } finally {
    running = false;
    setTimeout(loop, cfg.intervalMs);
  }
}

loop();

async function shutdown() {
  await graduation.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
