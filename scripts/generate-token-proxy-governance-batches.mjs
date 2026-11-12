#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, encodeFunctionData, getAddress, http, keccak256, stringToHex, zeroHash,
} from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (required("SQUEEZ_CHAIN") !== "robinhood" || required("SQUEEZ_NETWORK") !== "mainnet") {
  throw new Error("Token-proxy governance batches are restricted to Robinhood mainnet");
}
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (chainId !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "packages/contracts/deployments/robinhood");
const proxy = JSON.parse(readFileSync(resolve(directory, "mainnet-token-proxy.json"), "utf8"));
const activation = JSON.parse(readFileSync(resolve(directory, "mainnet-token-proxy-activation.json"), "utf8"));
const safe = getAddress(required("GOVERNANCE_SAFE_ADDRESS"));
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const factory = getAddress(required("FACTORY_ADDRESS"));
const tokenDeployer = getAddress(proxy.tokenDeployer);
const tokenBeacon = getAddress(proxy.tokenBeacon);
const factoryImplementation = getAddress(activation.factoryImplementation);
const curveProxyDeployer = getAddress(activation.curveProxyDeployer);
const curveBeacon = getAddress(required("CURVE_BEACON_ADDRESS"));
const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));

const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const factoryAbi = [
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "upgradeToAndCall", stateMutability: "payable", inputs: [{ type: "address" }, { type: "bytes" }], outputs: [] },
  { type: "function", name: "setLaunchDeployers", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }], outputs: [] },
];
const tokenDeployerAbi = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenBeacon", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const curveDeployerAbi = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "beacon", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const timelockAbi = [
  { type: "function", name: "getMinDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "scheduleBatch", stateMutability: "nonpayable", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" },
  ], outputs: [] },
  { type: "function", name: "executeBatch", stateMutability: "payable", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" },
  ], outputs: [] },
];

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const [actualChainId, owner, activeConfigId, beaconOwner, boundTokenFactory, deployedTokenBeacon,
  boundCurveFactory, deployedCurveBeacon, onchainDelay] = await Promise.all([
  client.getChainId(),
  client.readContract({ address: factory, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeConfigId" }),
  client.readContract({ address: tokenBeacon, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: tokenDeployer, abi: tokenDeployerAbi, functionName: "factory" }),
  client.readContract({ address: tokenDeployer, abi: tokenDeployerAbi, functionName: "tokenBeacon" }),
  client.readContract({ address: curveProxyDeployer, abi: curveDeployerAbi, functionName: "factory" }),
  client.readContract({ address: curveProxyDeployer, abi: curveDeployerAbi, functionName: "beacon" }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "getMinDelay" }),
]);
if (actualChainId !== chainId || getAddress(owner) !== timelock || getAddress(beaconOwner) !== timelock) {
  throw new Error("Chain or governance ownership mismatch");
}
if (activeConfigId !== 1n) throw new Error("Expected active 4.2 ETH config #1");
if (getAddress(boundTokenFactory) !== factory || getAddress(boundCurveFactory) !== factory) throw new Error("Factory binding mismatch");
if (getAddress(deployedTokenBeacon) !== tokenBeacon || getAddress(deployedCurveBeacon) !== curveBeacon) throw new Error("Beacon binding mismatch");
if (onchainDelay !== delay || delay < 300n) throw new Error("Timelock delay mismatch");

const targets = [factory, factory];
const values = [0n, 0n];
const payloads = [
  encodeFunctionData({ abi: factoryAbi, functionName: "upgradeToAndCall", args: [factoryImplementation, "0x"] }),
  encodeFunctionData({ abi: factoryAbi, functionName: "setLaunchDeployers", args: [tokenDeployer, curveProxyDeployer] }),
];
const salt = keccak256(stringToHex(`Squeez Robinhood mainnet token proxy ${tokenBeacon}`));
const scheduleData = encodeFunctionData({ abi: timelockAbi, functionName: "scheduleBatch", args: [targets, values, payloads, zeroHash, salt, delay] });
const executeData = encodeFunctionData({ abi: timelockAbi, functionName: "executeBatch", args: [targets, values, payloads, zeroHash, salt] });
await client.call({ account: safe, to: timelock, data: scheduleData });

const builder = (name, description, data) => ({
  version: "1.0", chainId: String(chainId), createdAt: Date.now(),
  meta: { name, description, txBuilderVersion: "1.18.0", createdFromSafeAddress: safe, createdFromOwnerAddress: "" },
  transactions: [{ to: timelock, value: "0", data, contractMethod: null, contractInputsValues: null }],
});
const summary = { ready: true, chainId, safe, timelock, factory, factoryImplementation, tokenBeacon,
  tokenDeployer, curveProxyDeployer, activeConfigId: activeConfigId.toString(), delaySeconds: delay.toString(),
  salt, scheduleSimulation: true };
if (process.argv.includes("--write")) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "mainnet-safe-schedule-token-proxy.json"), `${JSON.stringify(builder(
    "Schedule Squeez token proxy activation", "Schedules the atomic Factory upgrade and launch-deployer activation.", scheduleData,
  ), null, 2)}\n`);
  writeFileSync(resolve(directory, "mainnet-safe-execute-token-proxy.json"), `${JSON.stringify(builder(
    "Execute Squeez token proxy activation", "Activates BeaconProxy tokens after the governance delay.", executeData,
  ), null, 2)}\n`);
  summary.wroteFiles = true;
}
console.log(JSON.stringify(summary, null, 2));
