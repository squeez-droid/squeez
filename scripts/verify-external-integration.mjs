#!/usr/bin/env node

import assert from "node:assert/strict";

const api = (process.env.SQUEEZ_PUBLIC_API_URL || "https://api.squeez.tech").replace(/\/$/, "");
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["robinhood/mainnet", "elysium/mainnet", "hyperevm/mainnet", "robinhood/testnet"];
const partnerOrigin = "https://partner.example";

async function request(path, { allow = [200], binary = false } = {}) {
  const response = await fetch(`${api}${path}`, {
    headers: { origin: partnerOrigin, accept: binary ? "image/*" : "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  assert.ok(allow.includes(response.status), `${path} returned ${response.status}`);
  assert.equal(response.headers.get("access-control-allow-origin"), "*", `${path} is not public CORS`);
  return binary ? new Uint8Array(await response.arrayBuffer()) : response.json();
}

const summaries = [];
for (const target of targets) {
  assert.match(target, /^(elysium|hyperevm|robinhood)\/(testnet|mainnet)$/);
  const prefix = `/v1/${target}`;
  const [chain, network] = target.split("/");
  const [manifest, feed, tokenList] = await Promise.all([
    request(`${prefix}/integrations/launchpad.json`),
    request(`${prefix}/integrations/tokens.json`),
    request(`${prefix}/token-list.json`),
  ]);

  assert.equal(manifest.schema, "squeez.external-launchpad.v1");
  assert.equal(feed.schema, "squeez.external-token-feed.v1");
  assert.equal(feed.chain, chain);
  assert.equal(feed.network, network);
  assert.equal(manifest.discovery.partnerTokenFeed, `${api}${prefix}/integrations/tokens.json`);
  assert.equal(manifest.discovery.tokenList, `${api}${prefix}/token-list.json`);
  assert.ok(Array.isArray(feed.tokens));
  assert.ok(Array.isArray(tokenList.tokens));

  const listed = new Map(tokenList.tokens.map((token) => [token.address.toLowerCase(), token]));
  let graduated = 0;
  for (const token of feed.tokens) {
    const address = token.address.toLowerCase();
    const standard = listed.get(address);
    assert.ok(standard, `${target}:${token.symbol} is missing from token-list.json`);
    assert.equal(standard.logoURI, token.metadata.logoURI);
    assert.equal(token.metadata.url, `${api}${prefix}/tokens/${token.address}/metadata`);
    assert.equal(token.execution.routeURL, `${api}${prefix}/tokens/${token.address}/route`);
    assert.ok(token.metadata.imageUri?.startsWith("ipfs://"), `${target}:${token.symbol} has no IPFS image`);

    const [metadata, logo, route] = await Promise.all([
      request(`${prefix}/tokens/${token.address}/metadata`),
      request(`${prefix}/tokens/${token.address}/logo`, { binary: true }),
      request(`${prefix}/tokens/${token.address}/route`),
    ]);
    assert.match(metadata.schema, /^squeez\.token\.v\d+$/);
    assert.ok(metadata.imagePath || metadata.image, `${target}:${token.symbol} metadata has no image reference`);
    assert.ok(logo.byteLength > 0, `${target}:${token.symbol} logo is empty`);
    assert.equal(route.token.toLowerCase(), address);
    assert.equal(route.status, token.lifecycle.status);

    if (token.lifecycle.status === "graduated") {
      graduated += 1;
      assert.equal(token.execution.requiresLaunchpadAdapter, false);
      assert.equal(token.execution.quoteURL, null);
      assert.ok(token.lifecycle.pool, `${target}:${token.symbol} graduated without a pool`);
      const pool = await request(`${prefix}/tokens/${token.address}/pool`);
      assert.equal(pool.token.toLowerCase(), address);
      assert.ok(pool.poolKey && pool.poolId, `${target}:${token.symbol} has no PoolKey`);
    } else {
      assert.equal(token.lifecycle.status, "curve");
      assert.equal(token.execution.requiresLaunchpadAdapter, true);
      assert.ok(token.execution.quoteURL, `${target}:${token.symbol} has no curve quote endpoint`);
      const poolError = await request(`${prefix}/tokens/${token.address}/pool`, { allow: [409] });
      assert.equal(poolError.venue, "squeez-curve");
    }
  }

  summaries.push({ target: `${chain}:${network}`, tokens: feed.tokens.length, graduated });
}

console.log(JSON.stringify({ ready: true, api, targets: summaries }, null, 2));
