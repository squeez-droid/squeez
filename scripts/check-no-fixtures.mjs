import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const forbiddenFiles = [
  "apps/web/data/config.json",
  "apps/web/data/tokens.json",
  "apps/web/data/quotePairs.json",
  "apps/web/data/stats.json",
  "apps/web/data/trades.json",
  "apps/web/data/holders.json",
  "apps/web/data/candles.json",
  "apps/web/data/creatorFees.json",
  "apps/web/data/wallet.json",
  "apps/web/scripts/generate-mock.mjs",
];
const forbiddenPatterns = [
  ["demo wallet", /demo\s*wallet/i],
  ["demo-wallet env", /NEXT_PUBLIC_DEMO_WALLET/],
  ["fake transaction hash", /randHash|Math\.random\(\).*padEnd\(64/],
  ["placeholder chain ID", /999_999|999999/],
  ["known placeholder contract address", /0x5a0e0{30,}/i],
];
const roots = ["apps", "packages", "tools"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);
const ignored = new Set(["node_modules", ".next", ".open-next", "out", "dist", "cache", "generated"]);
const failures = [];

for (const file of forbiddenFiles) {
  if (existsSync(join(root, file))) failures.push(`${file}: forbidden fixture file exists`);
}

function walk(path) {
  for (const name of readdirSync(path)) {
    if (ignored.has(name)) continue;
    const absolute = join(path, name);
    const stat = statSync(absolute);
    if (stat.isDirectory()) walk(absolute);
    else if (extensions.has(extname(name))) {
      const text = readFileSync(absolute, "utf8");
      for (const [label, pattern] of forbiddenPatterns) {
        if (pattern.test(text)) failures.push(`${relative(root, absolute)}: ${label}`);
      }
    }
  }
}

for (const path of roots) walk(join(root, path));

if (failures.length) {
  console.error(`Fixture policy failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log("Fixture policy passed.");
