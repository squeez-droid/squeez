#!/usr/bin/env node
import { createPublicClient, getAddress, http, isAddress } from "viem";

const EXPECTED = Object.freeze({
  chainId: 99901,
  wrappedNative: getAddress("0xbA876237B0F021A6c6D852d6c26E107997cC5E81"),
  usdc: getAddress("0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65"),
  permit2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  poolManager: getAddress("0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1"),
  positionManager: getAddress("0x1d1C51b9d07fD27d36412A2b66CC23D19Eb3E518"),
  positionDescriptor: getAddress("0x9f92C5297EB3b39E6804b5e03899bC66B6b77348"),
  universalRouter: getAddress("0x1B341FDD55d56F8E08409A2C25DDFad93Eb03C1a"),
  stateView: getAddress("0x27eD73aE0652fdCf71d6793412A7525f32bE9dfE"),
  quoter: getAddress("0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5"),
});

const value = (name) => process.env[name]?.trim() || "";
const blockers = [];
const block = (code, detail) => blockers.push({ code, detail });

if (value("SQUEEZ_CHAIN") !== "elysium" || value("SQUEEZ_NETWORK") !== "mainnet") {
  block("TARGET_MISMATCH", "Run through `with-env.mjs elysium mainnet`.");
}
if (Number(value("SQUEEZ_CHAIN_ID")) !== EXPECTED.chainId) {
  block("CHAIN_ID_CONFIG", `Expected ${EXPECTED.chainId}, received ${value("SQUEEZ_CHAIN_ID") || "empty"}.`);
}
if (value("DATABASE_SCHEMA") !== "mainnet") block("DATABASE_SCHEMA", "Elysium mainnet requires schema `mainnet`.");

const primaryRpc = value("SQUEEZ_RPC");
const fallbackRpc = value("SQUEEZ_RPC_FALLBACK");
for (const [label, rpc] of [["primary", primaryRpc], ["fallback", fallbackRpc]]) {
  if (!rpc) block(`RPC_${label.toUpperCase()}_MISSING`, `${label} RPC is required.`);
  else if (!rpc.startsWith("https://")) block(`RPC_${label.toUpperCase()}_HTTPS`, `${label} RPC must use HTTPS.`);
}
if (primaryRpc && fallbackRpc && new URL(primaryRpc).hostname === new URL(fallbackRpc).hostname) {
  block("RPC_NOT_INDEPENDENT", "Primary and fallback RPC must use different provider hosts.");
}
if (primaryRpc && new URL(primaryRpc).hostname === "rpc.elysium.kinetiq.xyz") {
  block("RPC_PRIMARY_PUBLIC", "The shared public RPC may only be used as fallback.");
}
if (!value("INDEXER_RPC")) block("INDEXER_ARCHIVE_RPC", "Configure an archive-capable INDEXER_RPC before indexing.");
else if (new URL(value("INDEXER_RPC")).hostname === "rpc.elysium.kinetiq.xyz") {
  block("INDEXER_PUBLIC_RPC", "Public RPC is allowed for temporary development, but not production backfill/indexing.");
}

const officialAddresses = {
  WRAPPED_NATIVE_ADDRESS: EXPECTED.wrappedNative,
  USDC_ADDRESS: EXPECTED.usdc,
  PERMIT2: EXPECTED.permit2,
  POOL_MANAGER: EXPECTED.poolManager,
  POSITION_MANAGER: EXPECTED.positionManager,
  POSITION_DESCRIPTOR_ADDRESS: EXPECTED.positionDescriptor,
  UNIVERSAL_ROUTER: EXPECTED.universalRouter,
  V4_STATE_VIEW_ADDRESS: EXPECTED.stateView,
  V4_QUOTER_ADDRESS: EXPECTED.quoter,
};
for (const [name, expected] of Object.entries(officialAddresses)) {
  const configured = value(name);
  if (!isAddress(configured)) block(`${name}_INVALID`, `${name} is missing or invalid.`);
  else if (getAddress(configured) !== expected) block(`${name}_MISMATCH`, `${name} differs from the official address.`);
}

async function inspectRpc(label, rpc) {
  if (!rpc || !rpc.startsWith("https://")) return { label, reachable: false };
  try {
    const client = createPublicClient({ transport: http(rpc, { timeout: 12_000, retryCount: 1 }) });
    const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
    if (chainId !== EXPECTED.chainId) block(`RPC_${label.toUpperCase()}_CHAIN`, `${label} returned chain ${chainId}.`);
    return { label, reachable: true, chainId, blockNumber: blockNumber.toString() };
  } catch (error) {
    block(`RPC_${label.toUpperCase()}_UNREACHABLE`, error instanceof Error ? error.message : String(error));
    return { label, reachable: false };
  }
}

const rpcChecks = await Promise.all([inspectRpc("primary", primaryRpc), inspectRpc("fallback", fallbackRpc)]);
const bytecode = {};
const wiring = {};
// Prefer the independent fallback for verification so an intermittently rate-limited primary cannot hide
// bytecode problems. Production indexing still requires the dedicated archive endpoint above.
const inspectionRpc = rpcChecks[1]?.reachable ? fallbackRpc : (rpcChecks[0]?.reachable ? primaryRpc : "");
if (inspectionRpc) {
  try {
    const client = createPublicClient({ transport: http(inspectionRpc, { timeout: 12_000, retryCount: 1 }) });
    for (const [name, address] of Object.entries(officialAddresses)) {
      const code = await client.getBytecode({ address });
      bytecode[name] = Boolean(code && code !== "0x");
      if (!bytecode[name]) block(`${name}_NO_BYTECODE`, `${name} has no mainnet bytecode.`);
    }
    const poolManagerAbi = [{
      type: "function", name: "poolManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }],
    }];
    const permit2Abi = [{
      type: "function", name: "permit2", stateMutability: "view", inputs: [], outputs: [{ type: "address" }],
    }];
    const [positionManagerPoolManager, positionManagerPermit2, quoterPoolManager] = await Promise.all([
      client.readContract({ address: EXPECTED.positionManager, abi: poolManagerAbi, functionName: "poolManager" }),
      client.readContract({ address: EXPECTED.positionManager, abi: permit2Abi, functionName: "permit2" }),
      client.readContract({ address: EXPECTED.quoter, abi: poolManagerAbi, functionName: "poolManager" }),
    ]);
    wiring.positionManagerPoolManager = positionManagerPoolManager;
    wiring.positionManagerPermit2 = positionManagerPermit2;
    wiring.quoterPoolManager = quoterPoolManager;
    if (getAddress(positionManagerPoolManager) !== EXPECTED.poolManager) {
      block("POSITION_MANAGER_POOL_MANAGER", "PositionManager points to a different PoolManager.");
    }
    if (getAddress(positionManagerPermit2) !== EXPECTED.permit2) {
      block("POSITION_MANAGER_PERMIT2", "PositionManager points to a different Permit2.");
    }
    if (getAddress(quoterPoolManager) !== EXPECTED.poolManager) {
      block("QUOTER_POOL_MANAGER", "Quoter points to a different PoolManager.");
    }
  } catch (error) {
    block("OFFICIAL_BYTECODE_CHECK", error instanceof Error ? error.message : String(error));
  }
}

console.log(JSON.stringify({
  target: "elysium:mainnet",
  readyForBroadcast: blockers.length === 0,
  readyForPublicWrites: false,
  rpcChecks,
  officialContractBytecode: bytecode,
  officialContractWiring: wiring,
  blockers,
}, null, 2));
if (blockers.length) process.exitCode = 2;
