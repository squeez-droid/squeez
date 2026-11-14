#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, encodeFunctionData, getAddress, http, keccak256, stringToHex, toFunctionSelector, zeroHash,
} from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (required("SQUEEZ_CHAIN") !== "robinhood" || required("SQUEEZ_NETWORK") !== "mainnet") {
  throw new Error("Curve upgrade governance batches are restricted to Robinhood mainnet");
}
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (chainId !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");

const safe = getAddress(required("GOVERNANCE_SAFE_ADDRESS"));
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const curveBeacon = getAddress(required("CURVE_BEACON_ADDRESS"));
const newImplementation = getAddress(required("CURVE_IMPLEMENTATION_ADDRESS"));
const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
if (delay < 300n) throw new Error("Mainnet governance delay must be at least 300 seconds");

const beaconAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "upgradeTo", stateMutability: "nonpayable", inputs: [{ name: "newImplementation", type: "address" }], outputs: [] },
];
const timelockAbi = [
  { type: "function", name: "getMinDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "scheduleBatch", stateMutability: "nonpayable", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" },
    { type: "bytes32" }, { type: "uint256" },
  ], outputs: [] },
  { type: "function", name: "executeBatch", stateMutability: "payable", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" },
  ], outputs: [] },
];
// The new implementation must expose every external entrypoint the integration kit relies on.
const requiredSelectors = [
  "buy(uint256,uint256)", "sell(uint256,uint256,uint256)",
  "buyTo(address,uint256,uint256)", "sellTo(uint256,uint256,uint256,address)",
  "quoteBuy(uint256)", "quoteSell(uint256)", "graduate()",
].map((signature) => ({ signature, selector: toFunctionSelector(signature).slice(2) }));

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const [actualChainId, owner, currentImplementation, onchainDelay, code] = await Promise.all([
  client.getChainId(),
  client.readContract({ address: curveBeacon, abi: beaconAbi, functionName: "owner" }),
  client.readContract({ address: curveBeacon, abi: beaconAbi, functionName: "implementation" }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "getMinDelay" }),
  client.getCode({ address: newImplementation }),
]);
if (actualChainId !== chainId) throw new Error("RPC chain ID mismatch");
if (getAddress(owner) !== timelock) throw new Error("Curve Beacon is not owned by the governance timelock");
if (onchainDelay !== delay) throw new Error("Timelock delay mismatch");
if (!code || code === "0x") throw new Error("New Curve implementation has no code");
if (getAddress(currentImplementation) === newImplementation) throw new Error("Beacon already uses this implementation");
const missing = requiredSelectors.filter(({ selector }) => !code.includes(selector)).map(({ signature }) => signature);
if (missing.length > 0) throw new Error(`New implementation is missing selectors: ${missing.join(", ")}`);

const targets = [curveBeacon];
const values = [0n];
const payloads = [encodeFunctionData({ abi: beaconAbi, functionName: "upgradeTo", args: [newImplementation] })];
const salt = keccak256(stringToHex(`Squeez Robinhood mainnet Curve buyTo/sellTo upgrade ${newImplementation}`));
const scheduleData = encodeFunctionData({
  abi: timelockAbi, functionName: "scheduleBatch", args: [targets, values, payloads, zeroHash, salt, delay],
});
const executeData = encodeFunctionData({
  abi: timelockAbi, functionName: "executeBatch", args: [targets, values, payloads, zeroHash, salt],
});
// Scheduling must succeed from the Safe. Execution can only be simulated after the delay has elapsed.
await client.call({ account: safe, to: timelock, data: scheduleData });

const builder = (name, description, data) => ({
  version: "1.0", chainId: String(chainId), createdAt: Date.now(),
  meta: { name, description, txBuilderVersion: "1.18.0", createdFromSafeAddress: safe, createdFromOwnerAddress: "" },
  transactions: [{ to: timelock, value: "0", data, contractMethod: null, contractInputsValues: null }],
});
const summary = {
  ready: true, chainId, safe, timelock, curveBeacon,
  currentImplementation: getAddress(currentImplementation), newImplementation,
  delaySeconds: delay.toString(), verifiedSelectors: requiredSelectors.map(({ signature }) => signature),
  salt, scheduleSimulation: true, scheduleData, executeData,
};
if (process.argv.includes("--write")) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "packages/contracts/deployments/robinhood");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "mainnet-safe-schedule-curve-buyto-upgrade.json"), `${JSON.stringify(builder(
    "Schedule Squeez Curve buyTo/sellTo upgrade",
    `Schedules the Curve Beacon upgrade to ${newImplementation}.`, scheduleData,
  ), null, 2)}\n`);
  writeFileSync(resolve(directory, "mainnet-safe-execute-curve-buyto-upgrade.json"), `${JSON.stringify(builder(
    "Execute Squeez Curve buyTo/sellTo upgrade",
    `Upgrades the Curve Beacon to ${newImplementation} after the governance delay.`, executeData,
  ), null, 2)}\n`);
  summary.wroteFiles = true;
}
console.log(JSON.stringify(summary, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
