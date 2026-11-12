#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, encodeFunctionData, getAddress, http, keccak256, stringToHex, zeroAddress, zeroHash,
} from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (required("SQUEEZ_CHAIN") !== "robinhood" || required("SQUEEZ_NETWORK") !== "mainnet") {
  throw new Error("Protected-launch governance batches are restricted to Robinhood mainnet");
}
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (chainId !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");
const safe = getAddress(required("GOVERNANCE_SAFE_ADDRESS"));
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const factory = getAddress(required("FACTORY_ADDRESS"));
const policies = getAddress(required("PROTECTION_POLICY_REGISTRY_ADDRESS"));
const identities = getAddress(required("IDENTITY_REGISTRY_ADDRESS"));
const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
const lockSeconds = Number(required("TICKER_LOCK_SECONDS"));
if (delay < 300n || lockSeconds !== 300) throw new Error("Mainnet governance and ticker lock must be at least/exactly 300 seconds");

const uint = (name, max) => {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error(`${name} is invalid`);
  return value;
};
const policyInput = {
  familyId: keccak256(stringToHex("squeez.protected-launch")),
  version: 0,
  protectionWindowSeconds: uint("SNIPER_TAX_DECAY_SECONDS", 86_400),
  initialFeeBps: uint("SNIPER_TAX_START_BPS", 9_900),
  maxBuyBpsPerTransaction: uint("MAX_BUY_BPS_PER_TRANSACTION", 1_000),
  maxBuyBpsPerAddress: uint("MAX_WALLET_BPS", 2_000),
};
if (policyInput.maxBuyBpsPerTransaction > policyInput.maxBuyBpsPerAddress) {
  throw new Error("Per-transaction cap exceeds per-address cap");
}

const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const registryAbi = [
  { type: "function", name: "policyCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "createPolicy", stateMutability: "nonpayable", inputs: [{ name: "input", type: "tuple", components: [
    { name: "familyId", type: "bytes32" }, { name: "version", type: "uint32" },
    { name: "protectionWindowSeconds", type: "uint32" }, { name: "initialFeeBps", type: "uint16" },
    { name: "maxBuyBpsPerTransaction", type: "uint16" }, { name: "maxBuyBpsPerAddress", type: "uint16" },
  ] }], outputs: [{ type: "uint256" }, { type: "bytes32" }] },
];
const identityAbi = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "setFactory", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
];
const factoryAbi = [
  { type: "function", name: "protectionPolicyRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "activeProtectionPolicyId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "identityRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "tickerLockSeconds", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "setIdentityRegistry", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint32" }], outputs: [] },
  { type: "function", name: "setProtectionPolicy", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
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
const [actualChainId, factoryOwner, policyOwner, identityOwner, policyCount, identityFactory,
  activePolicyRegistry, activePolicyId, activeIdentityRegistry, activeLockSeconds, onchainDelay] = await Promise.all([
  client.getChainId(),
  client.readContract({ address: factory, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: policies, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: identities, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: policies, abi: registryAbi, functionName: "policyCount" }),
  client.readContract({ address: identities, abi: identityAbi, functionName: "factory" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "protectionPolicyRegistry" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeProtectionPolicyId" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "identityRegistry" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "tickerLockSeconds" }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "getMinDelay" }),
]);
if (actualChainId !== chainId) throw new Error("RPC chain ID mismatch");
for (const [name, owner] of [["factory", factoryOwner], ["policy registry", policyOwner], ["identity registry", identityOwner]]) {
  if (getAddress(owner) !== timelock) throw new Error(`${name} is not owned by the governance timelock`);
}
if (onchainDelay !== delay) throw new Error("Timelock delay mismatch");
if (activePolicyId !== 0n || activePolicyRegistry !== zeroAddress || activeIdentityRegistry !== zeroAddress
  || Number(activeLockSeconds) !== 0) {
  throw new Error("Protected-launch configuration is not empty; use a dedicated upgrade/reconfiguration review");
}
if (identityFactory !== zeroAddress && getAddress(identityFactory) !== factory) throw new Error("Identity registry points to another factory");

const nextPolicyId = policyCount + 1n;
policyInput.version = Number(nextPolicyId);
const targets = [policies, identities, factory, factory];
const values = targets.map(() => 0n);
const payloads = [
  encodeFunctionData({ abi: registryAbi, functionName: "createPolicy", args: [policyInput] }),
  encodeFunctionData({ abi: identityAbi, functionName: "setFactory", args: [factory] }),
  encodeFunctionData({ abi: factoryAbi, functionName: "setIdentityRegistry", args: [identities, lockSeconds] }),
  encodeFunctionData({ abi: factoryAbi, functionName: "setProtectionPolicy", args: [policies, nextPolicyId] }),
];
const salt = keccak256(stringToHex(`Squeez Robinhood mainnet protected launch v${nextPolicyId} ${identities}`));
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
  ready: true, chainId, safe, timelock, delaySeconds: delay.toString(), nextPolicyId: nextPolicyId.toString(),
  policyInput, targets, identities, factory, salt, scheduleSimulation: true, scheduleData, executeData,
};
if (process.argv.includes("--write")) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "packages/contracts/deployments/robinhood");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "mainnet-safe-schedule-protected-launch.json"), `${JSON.stringify(builder(
    "Schedule Squeez protected launch", "Creates and activates the Robinhood mainnet launch-protection and 300-second identity lock policy.", scheduleData,
  ), null, 2)}\n`);
  writeFileSync(resolve(directory, "mainnet-safe-execute-protected-launch.json"), `${JSON.stringify(builder(
    "Execute Squeez protected launch", "Executes the protected-launch activation after the governance delay.", executeData,
  ), null, 2)}\n`);
  summary.wroteFiles = true;
}
console.log(JSON.stringify(summary, null, 2));
