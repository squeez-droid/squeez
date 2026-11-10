import { strict as assert } from "node:assert";
import { resolveTargetRoute } from "../apps/backend/src/target-routing.ts";

const served = { chain: "robinhood", stage: "mainnet" };

assert.deepEqual(resolveTargetRoute("/v1/robinhood/mainnet/config", served), {
  kind: "canonical", pathname: "/v1/config",
});
assert.deepEqual(resolveTargetRoute("/v1/robinhood/mainnet/health", served), {
  kind: "canonical", pathname: "/v1/health",
});
assert.deepEqual(resolveTargetRoute("/v1/elysium/testnet/tokens", served), {
  kind: "mismatch", requestedTarget: "elysium:testnet", servedTarget: "robinhood:mainnet",
});
assert.deepEqual(resolveTargetRoute("/v1/tokens", served), {
  kind: "legacy", pathname: "/v1/tokens", successor: "/v1/robinhood/mainnet/tokens",
});
assert.deepEqual(resolveTargetRoute("/v1/deployments", served), {
  kind: "unrelated", pathname: "/v1/deployments",
});
assert.deepEqual(resolveTargetRoute("/health", served), {
  kind: "unrelated", pathname: "/health",
});

console.log("Target-aware API routing passed.");
