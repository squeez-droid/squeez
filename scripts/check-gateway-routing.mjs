import { strict as assert } from "node:assert";
import { isReadOnlyRequestAllowed, readTargets, resolveUpstream } from "../apps/gateway/src/routing.mjs";

const targets = readTargets({
  ELYSIUM_TESTNET_API_URL: "http://elysium-testnet:8080/",
  ELYSIUM_TESTNET_CAPABILITY: "enabled",
  ROBINHOOD_TESTNET_API_URL: "http://robinhood-testnet:8080",
  ROBINHOOD_TESTNET_CAPABILITY: "read-only",
  ROBINHOOD_MAINNET_CAPABILITY: "maintenance",
});
assert.equal(targets.find((target) => target.id === "elysium:testnet").upstream, "http://elysium-testnet:8080");
assert.equal(resolveUpstream("/v1/elysium/testnet/tokens", targets).kind, "proxy");
assert.equal(resolveUpstream("/v1/robinhood/testnet/config", targets).target.capability, "read-only");
assert.equal(resolveUpstream("/v1/robinhood/mainnet/config", targets).status, 503);
assert.equal(resolveUpstream("/v1/elysium/mainnet/config", targets).status, 404);
assert.equal(resolveUpstream("/v1/tokens", targets).kind, "unmatched");
assert.throws(() => readTargets({ ROBINHOOD_MAINNET_CAPABILITY: "enabled" }), /API_URL is required/);
assert.throws(() => readTargets({ ROBINHOOD_MAINNET_CAPABILITY: "invalid" }), /CAPABILITY is invalid/);
assert.equal(isReadOnlyRequestAllowed("GET", "/v1/robinhood/mainnet/tokens"), true);
assert.equal(isReadOnlyRequestAllowed("POST", "/v1/robinhood/mainnet/rpc"), true);
assert.equal(isReadOnlyRequestAllowed("POST", "/v1/robinhood/mainnet/metadata"), false);
assert.equal(isReadOnlyRequestAllowed("GET", "/v1/robinhood/mainnet/metadata/nonce"), false);
assert.equal(isReadOnlyRequestAllowed("DELETE", "/v1/robinhood/mainnet/auth/x/session"), false);
console.log("Gateway allowlist routing passed.");
