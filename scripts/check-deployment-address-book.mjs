import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeploymentEnv } from "../tools/deployment-address-book.mjs";

const root = mkdtempSync(join(tmpdir(), "squeez-address-book-"));
mkdirSync(join(root, "packages/contracts/deployments"), { recursive: true });
writeFileSync(join(root, "packages/contracts/deployments/testnet.json"), JSON.stringify({
  network: "testnet",
  startBlock: 123,
  factory: "0x0000000000000000000000000000000000000001",
  feeVault: "0x0000000000000000000000000000000000000002",
  graduationAdapter: "0x0000000000000000000000000000000000000003",
}));
writeFileSync(join(root, "packages/contracts/deployments/testnet-core-upgrade.json"), JSON.stringify({
  network: "testnet",
  factoryImplementation: "0x0000000000000000000000000000000000000004",
}));
writeFileSync(join(root, "packages/contracts/deployments/testnet-graduation.json"), JSON.stringify({
  network: "testnet",
  graduationAdapter: "0x0000000000000000000000000000000000000005",
}));

const { values } = loadDeploymentEnv(root, "testnet");
assert.equal(values.FACTORY_START_BLOCK, "123");
assert.equal(values.FACTORY_ADDRESS, "0x0000000000000000000000000000000000000001");
assert.equal(values.FEE_VAULT_ADDRESS, "0x0000000000000000000000000000000000000002");
assert.equal(values.FACTORY_IMPLEMENTATION_ADDRESS, "0x0000000000000000000000000000000000000004");
assert.equal(values.GRADUATION_ADAPTER_ADDRESS, "0x0000000000000000000000000000000000000005");
console.log("Deployment address-book mapping passed.");
