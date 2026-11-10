#!/usr/bin/env node

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const compose = parse(readFileSync("deploy/coolify/compose.multitarget.yaml", "utf8"));
const services = compose.services;
const api = services["api-robinhood-mainnet"];
const indexer = services["indexer-robinhood-mainnet"];
const gateway = services.gateway;

assert(api, "Robinhood mainnet API service is missing");
assert(indexer, "Robinhood mainnet indexer service is missing");
assert.equal(api.environment.SQUEEZ_CHAIN, "robinhood");
assert.equal(api.environment.SQUEEZ_NETWORK, "mainnet");
assert.equal(api.environment.SQUEEZ_API_CAPABILITY, "read-only");
assert.equal(api.environment.DATABASE_SCHEMA, "robinhood_mainnet");
assert.match(api.healthcheck.test.at(-1), /\/v1\/robinhood\/mainnet\/ready$/);
assert.equal(indexer.environment.SQUEEZ_CHAIN, "robinhood");
assert.equal(indexer.environment.SQUEEZ_NETWORK, "mainnet");
assert.equal(indexer.environment.DATABASE_SCHEMA, "robinhood_mainnet");
assert.match(gateway.environment.ROBINHOOD_MAINNET_API_URL, /api-robinhood-mainnet/);
assert.match(gateway.environment.ROBINHOOD_MAINNET_CAPABILITY, /read-only/);
assert(gateway.depends_on["api-robinhood-mainnet"], "Gateway must wait for the mainnet API healthcheck");

console.log("Robinhood mainnet read-only Compose isolation passed.");
