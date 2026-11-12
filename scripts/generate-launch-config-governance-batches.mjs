#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
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
  throw new Error("Launch-config governance batches are restricted to Robinhood mainnet");
}
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (chainId !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");

const safe = getAddress(required("GOVERNANCE_SAFE_ADDRESS"));
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const factory = getAddress(required("FACTORY_ADDRESS"));
const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
if (delay < 300n) throw new Error("Mainnet governance delay must be at least 300 seconds");

const positive = (name) => {
  const value = BigInt(required(name));
  if (value <= 0n) throw new Error(`${name} must be positive`);
  return value;
};
const threshold = positive("GRADUATION_THRESHOLD_HYPE");
if (threshold !== 4_200_000_000_000_000_000n) {
  throw new Error("Robinhood mainnet graduation threshold must be exactly 4.2 ETH");
}
const config = {
  graduationThresholdHype: threshold,
  virtualHypeReserve: process.env.VIRTUAL_HYPE_RESERVE?.trim()
    ? BigInt(process.env.VIRTUAL_HYPE_RESERVE) : threshold * 2n / 5n,
  virtualTokenReserve: process.env.VIRTUAL_TOKEN_RESERVE?.trim()
    ? BigInt(process.env.VIRTUAL_TOKEN_RESERVE) : 1_000_000_000n * 10n ** 18n,
  sniperTaxStartBps: Number(required("SNIPER_TAX_START_BPS")),
  sniperTaxDecaySeconds: Number(required("SNIPER_TAX_DECAY_SECONDS")),
  maxWalletBps: Number(required("MAX_WALLET_BPS")),
  maxWalletWindowSeconds: Number(required("MAX_WALLET_WINDOW_SECONDS")),
  launchFeeHype: BigInt(required("LAUNCH_FEE_HYPE")),
};
if (config.virtualHypeReserve !== 1_680_000_000_000_000_000n) {
  throw new Error("Expected a 1.68 ETH virtual reserve for the 4.2 ETH curve");
}

const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const factoryAbi = [
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchConfigs", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
    { type: "uint32" }, { type: "uint16" }, { type: "uint32" }, { type: "uint256" },
  ] },
  { type: "function", name: "setLaunchConfig", stateMutability: "nonpayable", inputs: [{ name: "cfg", type: "tuple", components: [
    { name: "graduationThresholdHype", type: "uint256" }, { name: "virtualHypeReserve", type: "uint256" },
    { name: "virtualTokenReserve", type: "uint256" }, { name: "sniperTaxStartBps", type: "uint16" },
    { name: "sniperTaxDecaySeconds", type: "uint32" }, { name: "maxWalletBps", type: "uint16" },
    { name: "maxWalletWindowSeconds", type: "uint32" }, { name: "launchFeeHype", type: "uint256" },
  ] }], outputs: [] },
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

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const [actualChainId, owner, activeConfigId, currentConfig, onchainDelay] = await Promise.all([
  client.getChainId(),
  client.readContract({ address: factory, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeConfigId" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "launchConfigs", args: [0n] }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "getMinDelay" }),
]);
if (actualChainId !== chainId) throw new Error("RPC chain ID mismatch");
if (getAddress(owner) !== timelock) throw new Error("Factory is not owned by the governance timelock");
if (onchainDelay !== delay) throw new Error("Timelock delay mismatch");
if (activeConfigId !== 0n || currentConfig[0] !== 1_000_000_000_000_000_000n) {
  throw new Error("Unexpected active launch config; review the mainnet state before replacing it");
}

const targets = [factory];
const values = [0n];
const payloads = [encodeFunctionData({ abi: factoryAbi, functionName: "setLaunchConfig", args: [config] })];
const salt = keccak256(stringToHex("Squeez Robinhood mainnet graduation threshold 4.2 ETH v1"));
const scheduleData = encodeFunctionData({
  abi: timelockAbi, functionName: "scheduleBatch", args: [targets, values, payloads, zeroHash, salt, delay],
});
const executeData = encodeFunctionData({
  abi: timelockAbi, functionName: "executeBatch", args: [targets, values, payloads, zeroHash, salt],
});
await client.call({ account: safe, to: timelock, data: scheduleData });

const builder = (name, description, data) => ({
  version: "1.0", chainId: String(chainId), createdAt: Date.now(),
  meta: { name, description, txBuilderVersion: "1.18.0", createdFromSafeAddress: safe, createdFromOwnerAddress: "" },
  transactions: [{ to: timelock, value: "0", data, contractMethod: null, contractInputsValues: null }],
});
const summary = {
  ready: true, chainId, safe, timelock, factory, delaySeconds: delay.toString(),
  currentConfigId: activeConfigId.toString(), currentThresholdWei: currentConfig[0].toString(),
  nextConfigId: (activeConfigId + 1n).toString(), config,
  salt, scheduleSimulation: true, scheduleData, executeData,
};
if (process.argv.includes("--write")) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "packages/contracts/deployments/robinhood");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "mainnet-safe-schedule-launch-config-4.2.json"), `${JSON.stringify(builder(
    "Schedule Squeez 4.2 ETH graduation target",
    "Schedules Robinhood mainnet launch config #1 with a 4.2 ETH graduation target.", scheduleData,
  ), null, 2)}\n`);
  writeFileSync(resolve(directory, "mainnet-safe-execute-launch-config-4.2.json"), `${JSON.stringify(builder(
    "Execute Squeez 4.2 ETH graduation target",
    "Activates Robinhood mainnet launch config #1 after the governance delay.", executeData,
  ), null, 2)}\n`);
  summary.wroteFiles = true;
}
console.log(JSON.stringify(summary, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
