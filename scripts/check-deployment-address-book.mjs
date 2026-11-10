import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeploymentEnv } from "../tools/deployment-address-book.mjs";

const root = mkdtempSync(join(tmpdir(), "squeez-address-book-"));
mkdirSync(join(root, "packages/contracts/deployments"), { recursive: true });
writeFileSync(join(root, "packages/contracts/deployments/testnet.json"), JSON.stringify({
  chainId: 99801,
  network: "testnet",
  startBlock: 123,
  factory: "0x0000000000000000000000000000000000000001",
  feeVault: "0x0000000000000000000000000000000000000002",
  graduationAdapter: "0x0000000000000000000000000000000000000003",
}));
writeFileSync(join(root, "packages/contracts/deployments/testnet-core-upgrade.json"), JSON.stringify({
  network: "testnet",
  chainId: 99801,
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

mkdirSync(join(root, "packages/contracts/deployments/robinhood"), { recursive: true });
writeFileSync(join(root, "packages/contracts/deployments/robinhood/testnet.json"), JSON.stringify({
  chain: "robinhood",
  network: "testnet",
  chainId: 46630,
  startBlock: 46630,
  factory: "0x0000000000000000000000000000000000004663",
  maxBuyBpsPerTransaction: 100,
}));
const robinhood = loadDeploymentEnv(root, "testnet", "robinhood");
assert.equal(robinhood.values.FACTORY_START_BLOCK, "46630");
assert.equal(robinhood.values.FACTORY_ADDRESS, "0x0000000000000000000000000000000000004663");
assert.equal(robinhood.values.MAX_BUY_BPS_PER_TRANSACTION, "100");
assert.equal(robinhood.values.FEE_VAULT_ADDRESS, undefined, "Robinhood must never inherit Elysium addresses");

writeFileSync(join(root, "packages/contracts/deployments/robinhood/testnet-core-upgrade.json"), JSON.stringify({
  chain: "elysium",
  network: "testnet",
  chainId: 46630,
}));
assert.throws(
  () => loadDeploymentEnv(root, "testnet", "robinhood"),
  /deployment chain mismatch/,
  "A Robinhood target must reject an Elysium fragment",
);

writeFileSync(join(root, "packages/contracts/deployments/robinhood/testnet-core-upgrade.json"), JSON.stringify({
  chain: "robinhood",
  network: "mainnet",
  chainId: 46630,
}));
assert.throws(
  () => loadDeploymentEnv(root, "testnet", "robinhood"),
  /deployment network mismatch/,
  "A testnet target must reject a mainnet fragment",
);

writeFileSync(join(root, "packages/contracts/deployments/robinhood/testnet-core-upgrade.json"), JSON.stringify({
  chain: "robinhood",
  network: "testnet",
  chainId: 4663,
}));
assert.throws(
  () => loadDeploymentEnv(root, "testnet", "robinhood"),
  /deployment chain ID mismatch/,
  "Fragments for one target must use one chain ID",
);
console.log("Deployment address-book mapping passed.");
