import { strict as assert } from "node:assert";
import { deploymentSchema, operationalSchema } from "../packages/shared/src/network.ts";

const cases = [
  [{ chain: "elysium", stage: "testnet" }, "testnet", "testnet_system"],
  [{ chain: "elysium", stage: "mainnet" }, "mainnet", "mainnet_system"],
  [{ chain: "robinhood", stage: "testnet" }, "robinhood_testnet", "robinhood_testnet_system"],
  [{ chain: "robinhood", stage: "mainnet" }, "robinhood_mainnet", "robinhood_mainnet_system"],
];
for (const [target, dataSchema, logSchema] of cases) {
  assert.equal(deploymentSchema(target), dataSchema);
  assert.equal(operationalSchema(target), logSchema);
}
assert.equal(new Set(cases.map(([target]) => deploymentSchema(target))).size, cases.length);
assert.equal(new Set(cases.map(([target]) => operationalSchema(target))).size, cases.length);
console.log("Deployment data/log schema isolation passed.");
