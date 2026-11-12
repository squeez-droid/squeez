#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createPublicClient, decodeFunctionData, getAddress, http } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (required("SQUEEZ_CHAIN") !== "robinhood" || required("SQUEEZ_NETWORK") !== "mainnet"
  || Number(required("SQUEEZ_CHAIN_ID")) !== 4663) throw new Error("Target must be Robinhood mainnet");
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const schedule = JSON.parse(readFileSync(
  "packages/contracts/deployments/robinhood/mainnet-safe-schedule-protected-launch.json", "utf8",
));
const timelockAbi = [
  { type: "function", name: "scheduleBatch", stateMutability: "nonpayable", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" },
    { type: "bytes32" }, { type: "uint256" },
  ], outputs: [] },
  { type: "function", name: "hashOperationBatch", stateMutability: "pure", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" },
  ], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "getTimestamp", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isOperationPending", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isOperationReady", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isOperationDone", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
];
const transaction = schedule.transactions[0];
if (getAddress(transaction.to) !== timelock) throw new Error("Schedule batch targets another timelock");
const decoded = decodeFunctionData({ abi: timelockAbi, data: transaction.data });
if (decoded.functionName !== "scheduleBatch") throw new Error("Batch is not a scheduleBatch call");
const [targets, values, payloads, predecessor, salt] = decoded.args;
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const operationId = await client.readContract({
  address: timelock, abi: timelockAbi, functionName: "hashOperationBatch",
  args: [targets, values, payloads, predecessor, salt],
});
const [timestamp, pending, ready, done, block] = await Promise.all([
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "getTimestamp", args: [operationId] }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "isOperationPending", args: [operationId] }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "isOperationReady", args: [operationId] }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "isOperationDone", args: [operationId] }),
  client.getBlock(),
]);
const scheduled = timestamp > 1n;
const waitSeconds = scheduled && !done && timestamp > block.timestamp ? Number(timestamp - block.timestamp) : 0;
console.log(JSON.stringify({
  operationId, scheduled, pending, ready, done, timestamp: timestamp.toString(),
  currentTimestamp: block.timestamp.toString(), waitSeconds,
}, null, 2));
if (!scheduled && !done) process.exitCode = 2;
