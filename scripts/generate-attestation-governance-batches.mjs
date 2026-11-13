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
  throw new Error("Attestation governance batches are restricted to Robinhood mainnet");
}
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (chainId !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "packages/contracts/deployments/robinhood");
const deployment = JSON.parse(readFileSync(
  resolve(directory, "mainnet-factory-attestation-upgrade.json"), "utf8",
));
const safe = getAddress(required("GOVERNANCE_SAFE_ADDRESS"));
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const factory = getAddress(required("FACTORY_ADDRESS"));
const implementation = getAddress(deployment.factoryImplementation);
const attester = getAddress(required("SQUEEZ_ATTESTER_ADDRESS"));
const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
if (deployment.applied || getAddress(deployment.factory) !== factory) {
  throw new Error("Unexpected Factory implementation deployment record");
}

const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const factoryAbi = [
  { type: "function", name: "upgradeToAndCall", stateMutability: "payable", inputs: [{ type: "address" }, { type: "bytes" }], outputs: [] },
  { type: "function", name: "setAttester", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
  { type: "function", name: "setAttestationRequired", stateMutability: "nonpayable", inputs: [{ type: "bool" }], outputs: [] },
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
const [actualChainId, owner, onchainDelay, implementationCode] = await Promise.all([
  client.getChainId(),
  client.readContract({ address: factory, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "getMinDelay" }),
  client.getCode({ address: implementation }),
]);
if (actualChainId !== chainId || getAddress(owner) !== timelock) {
  throw new Error("Chain or Factory governance ownership mismatch");
}
if (onchainDelay !== delay || delay < 300n) throw new Error("Timelock delay mismatch");
if (!implementationCode || implementationCode === "0x") throw new Error("Factory implementation is not deployed");

const builder = (name, description, data) => ({
  version: "1.0", chainId: String(chainId), createdAt: Date.now(),
  meta: { name, description, txBuilderVersion: "1.18.0", createdFromSafeAddress: safe, createdFromOwnerAddress: "" },
  transactions: [{ to: timelock, value: "0", data, contractMethod: null, contractInputsValues: null }],
});
const operation = (name, targets, payloads) => {
  const values = targets.map(() => 0n);
  const salt = keccak256(stringToHex(name));
  return {
    salt,
    scheduleData: encodeFunctionData({
      abi: timelockAbi, functionName: "scheduleBatch", args: [targets, values, payloads, zeroHash, salt, delay],
    }),
    executeData: encodeFunctionData({
      abi: timelockAbi, functionName: "executeBatch", args: [targets, values, payloads, zeroHash, salt],
    }),
  };
};

// Upgrade and signer configuration intentionally do not make X a launch dependency yet.
const prepare = operation(
  `Squeez Robinhood anti-vamp attestation prepare ${implementation}`,
  [factory, factory],
  [
    encodeFunctionData({ abi: factoryAbi, functionName: "upgradeToAndCall", args: [implementation, "0x"] }),
    encodeFunctionData({ abi: factoryAbi, functionName: "setAttester", args: [attester] }),
  ],
);
await client.call({ account: safe, to: timelock, data: prepare.scheduleData });

// This second operation is uploaded only after OAuth and signing have passed production canary tests.
const activate = operation(
  `Squeez Robinhood anti-vamp attestation required ${implementation}`,
  [factory],
  [encodeFunctionData({ abi: factoryAbi, functionName: "setAttestationRequired", args: [true] })],
);

const write = (filename, name, description, data) => writeFileSync(
  resolve(directory, filename), `${JSON.stringify(builder(name, description, data), null, 2)}\n`,
);
if (process.argv.includes("--write")) {
  mkdirSync(directory, { recursive: true });
  write("mainnet-safe-schedule-attestation-prepare.json", "Schedule anti-vamp attestation preparation",
    "Schedules the Factory implementation upgrade and global attester configuration; launch remains available during rollout.", prepare.scheduleData);
  write("mainnet-safe-execute-attestation-prepare.json", "Execute anti-vamp attestation preparation",
    "Installs the required-attestation implementation and global attester after the governance delay.", prepare.executeData);
  write("mainnet-safe-schedule-attestation-required.json", "Schedule mandatory anti-vamp attestation",
    "Schedules mandatory creator attestation only after the production OAuth canary succeeds.", activate.scheduleData);
  write("mainnet-safe-execute-attestation-required.json", "Execute mandatory anti-vamp attestation",
    "Blocks unsigned launches and completes cross-chain anti-vamp enforcement.", activate.executeData);
}

console.log(JSON.stringify({
  ready: true, chainId, safe, timelock, factory, implementation, attester,
  delaySeconds: delay.toString(), prepareSalt: prepare.salt, activationSalt: activate.salt,
  scheduleSimulation: true, wroteFiles: process.argv.includes("--write"),
}, null, 2));
