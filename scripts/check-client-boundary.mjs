#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve("apps/web");
const allowedPublicEnv = new Set(["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SQUEEZ_NETWORK"]);
const forbiddenClientTerms = ["DATABASE_URL", "KEEPER_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY", "NEXT_PUBLIC_ELYSIUM_RPC", "NEXT_PUBLIC_SUPABASE", "NEXT_PUBLIC_FACTORY_ADDRESS", "NEXT_PUBLIC_FEE_VAULT_ADDRESS", "NEXT_PUBLIC_QUOTE_REGISTRY_ADDRESS"];

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

for (const file of files(resolve(webRoot, "src"))) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
    if (!allowedPublicEnv.has(match[0])) throw new Error(`${file}: disallowed public env ${match[0]}`);
  }
  for (const term of forbiddenClientTerms) {
    if (source.includes(term)) throw new Error(`${file}: private backend setting referenced by web: ${term}`);
  }
}

const assets = resolve(webRoot, ".open-next/assets");
if (statSync(assets, { throwIfNoEntry: false })?.isDirectory()) {
  const forbiddenValues = ["testnet-rpc.elysium.kinetiq.xyz", "rpc-live.elysp.com", "DATABASE_URL", "KEEPER_PRIVATE_KEY", "SUPABASE_ANON_KEY"];
  for (const file of files(assets)) {
    const builtAsset = readFileSync(file, "utf8");
    for (const value of forbiddenValues) {
      if (builtAsset.includes(value)) throw new Error(`${file}: backend-only value leaked into client asset: ${value}`);
    }
  }
}

console.log("Client/backend boundary passed.");
