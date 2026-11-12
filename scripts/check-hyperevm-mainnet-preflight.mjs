#!/usr/bin/env node
import { createPublicClient, getAddress, http, isAddress } from "viem";

const EXPECTED = Object.freeze({
  chainId: 999,
  wrappedNative: getAddress("0x5555555555555555555555555555555555555555"),
  permit2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  poolManager: getAddress("0x12D4Fd9C5DeDd00ab8a0bCe2CF0167bbf94b6B1F"),
  positionManager: getAddress("0x0d7Ab5B3db668128Aff6F70C4eBC71D7d4DA9bf9"),
  positionDescriptor: getAddress("0xfF0b85caDaC458D5aAcc22755e5107bfE31ED402"),
  universalRouter: getAddress("0xeD270A1Bcdc63cf1356D695e7f40961d4819d6bF"),
  stateView: getAddress("0x1656326235cb9E34Cb58CaDe53AE30789AB32A1A"),
  quoter: getAddress("0x108Bfe38532C98f8Cd8D7Ab49c9dDAa3675a1c5e"),
});

const value = (name) => process.env[name]?.trim() || "";
const blockers = [];
const block = (code, detail) => blockers.push({ code, detail });

if (value("SQUEEZ_CHAIN") !== "hyperevm" || value("SQUEEZ_NETWORK") !== "mainnet") {
  block("TARGET_MISMATCH", "Run through `with-env.mjs hyperevm mainnet`.");
}
if (Number(value("SQUEEZ_CHAIN_ID")) !== EXPECTED.chainId) {
  block("CHAIN_ID_CONFIG", `Expected ${EXPECTED.chainId}, received ${value("SQUEEZ_CHAIN_ID") || "empty"}.`);
}
if (value("DATABASE_SCHEMA") !== "hyperevm_mainnet") {
  block("DATABASE_SCHEMA", "HyperEVM mainnet requires schema `hyperevm_mainnet`.");
}

const primaryRpc = value("SQUEEZ_RPC");
const fallbackRpc = value("SQUEEZ_RPC_FALLBACK");
for (const [label, rpc] of [["primary", primaryRpc], ["fallback", fallbackRpc]]) {
  if (!rpc) block(`RPC_${label.toUpperCase()}_MISSING`, `${label} RPC is required.`);
  else if (!rpc.startsWith("https://")) block(`RPC_${label.toUpperCase()}_HTTPS`, `${label} RPC must use HTTPS.`);
}
if (primaryRpc && fallbackRpc && new URL(primaryRpc).hostname === new URL(fallbackRpc).hostname) {
  block("RPC_NOT_INDEPENDENT", "Primary and fallback RPC must use different provider hosts.");
}
if (primaryRpc && new URL(primaryRpc).hostname === "rpc.hyperliquid.xyz") {
  block("RPC_PRIMARY_PUBLIC", "The shared public RPC may only be used as fallback.");
}
if (!value("INDEXER_RPC")) block("INDEXER_ARCHIVE_RPC", "Configure an archive-capable INDEXER_RPC before indexing.");
else if (new URL(value("INDEXER_RPC")).hostname === "rpc.hyperliquid.xyz") {
  block("INDEXER_PUBLIC_RPC", "HyperEVM public RPC is allowed for temporary development, but it has no historical state and is not production indexing infrastructure.");
}

const officialAddresses = {
  WRAPPED_NATIVE_ADDRESS: EXPECTED.wrappedNative,
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
  target: "hyperevm:mainnet",
  readyForBroadcast: blockers.length === 0,
  readyForPublicWrites: false,
  rpcChecks,
  officialContractBytecode: bytecode,
  officialContractWiring: wiring,
  blockers,
}, null, 2));
if (blockers.length) process.exitCode = 2;
