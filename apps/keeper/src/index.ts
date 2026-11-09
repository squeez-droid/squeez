import { loadConfig } from "./config";
import { runBuybackTick } from "./buyback";

const cfg = loadConfig();
console.log(`[keeper] started on ${cfg.network}, interval ${cfg.intervalMs / 1000}s`);

async function loop() {
  try {
    await runBuybackTick(cfg);
  } catch (err) {
    console.error("[keeper] tick failed", err);
  }
  setTimeout(loop, cfg.intervalMs);
}

loop();
