import assert from "node:assert/strict";
import { selectReadinessTargets, summarizeReadiness } from "../apps/gateway/src/readiness.mjs";

const targets = [
  { id: "robinhood:mainnet", stage: "mainnet", upstream: "http://mainnet", capability: "enabled" },
  { id: "elysium:testnet", stage: "testnet", upstream: "http://testnet", capability: "enabled" },
  { id: "hyperevm:mainnet", stage: "mainnet", upstream: "", capability: "coming-soon" },
];

assert.deepEqual(selectReadinessTargets(targets).map((target) => target.id), ["robinhood:mainnet"]);
assert.deepEqual(selectReadinessTargets(targets, "testnet").map((target) => target.id), ["elysium:testnet"]);
assert.deepEqual(selectReadinessTargets(targets, "all").map((target) => target.id), [
  "robinhood:mainnet",
  "elysium:testnet",
]);
assert.throws(() => selectReadinessTargets(targets, "invalid"), /Invalid network filter/);

assert.deepEqual(summarizeReadiness("mainnet", [
  { target: "robinhood:mainnet", ready: true, dataReady: true },
]), {
  ready: true,
  network: "mainnet",
  targets: [{ target: "robinhood:mainnet", ready: true, dataReady: true }],
});
assert.equal(summarizeReadiness("mainnet", [
  { target: "robinhood:mainnet", ready: true, dataReady: false },
]).ready, false);
assert.equal(summarizeReadiness("mainnet", []).ready, false);

console.log("Gateway readiness checks passed");
