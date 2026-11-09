import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const network = process.env.SQUEEZ_NETWORK;
if (!network) throw new Error("SQUEEZ_NETWORK is required");
const deployment = JSON.parse(readFileSync(resolve("packages/contracts/deployments", `${network}.json`), "utf8"));
const checks = {
  FACTORY_ADDRESS: deployment.factory,
  FACTORY_START_BLOCK: String(deployment.startBlock),
  QUOTE_REGISTRY_ADDRESS: deployment.quoteRegistry,
  FEE_VAULT_ADDRESS: deployment.feeVault,
  CURVE_BEACON_ADDRESS: deployment.curveBeacon,
};
for (const [name, expected] of Object.entries(checks)) {
  if (process.env[name] !== expected) throw new Error(`${name} was not loaded from the ${network} address book`);
}
console.log(`${network} deployment addresses loaded from the address book.`);
