#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient, decodeFunctionData, getAddress, http, parseAbiItem,
} from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (required("SQUEEZ_CHAIN") !== "robinhood" || required("SQUEEZ_NETWORK") !== "mainnet"
  || Number(required("SQUEEZ_CHAIN_ID")) !== 4663) throw new Error("Target must be Robinhood mainnet");
const directory = "packages/contracts/deployments/robinhood";
const scheduleBatch = JSON.parse(readFileSync(`${directory}/mainnet-safe-schedule-protected-launch.json`, "utf8"));
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const timelockAbi = [
  { type: "function", name: "scheduleBatch", stateMutability: "nonpayable", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" },
    { type: "bytes32" }, { type: "uint256" },
  ], outputs: [] },
  { type: "function", name: "hashOperationBatch", stateMutability: "pure", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" },
  ], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "isOperationDone", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
];
const decoded = decodeFunctionData({ abi: timelockAbi, data: scheduleBatch.transactions[0].data });
const [targets, values, payloads, predecessor, salt] = decoded.args;
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const operationId = await client.readContract({
  address: timelock, abi: timelockAbi, functionName: "hashOperationBatch",
  args: [targets, values, payloads, predecessor, salt],
});
if (!await client.readContract({ address: timelock, abi: timelockAbi, functionName: "isOperationDone", args: [operationId] })) {
  throw new Error("Protected-launch operation is not complete");
}
const head = await client.getBlockNumber();
const blockAtOrAfter = async (timestamp) => {
  let low = head > 20_000n ? head - 20_000n : 0n;
  let high = head;
  while (low < high) {
    const middle = (low + high) / 2n;
    const block = await client.getBlock({ blockNumber: middle });
    if (block.timestamp < timestamp) low = middle + 1n;
    else high = middle;
  }
  return low;
};
const readyTimestamp = 1_794_463_893n;
const scheduleFrom = await blockAtOrAfter(readyTimestamp - 330n);
const scheduleTo = await blockAtOrAfter(readyTimestamp - 270n);
const executeFrom = await blockAtOrAfter(readyTimestamp);
const executeTo = await blockAtOrAfter(readyTimestamp + 240n);
const scheduledEvent = parseAbiItem("event CallScheduled(bytes32 indexed id,uint256 indexed index,address target,uint256 value,bytes data,bytes32 predecessor,uint256 delay)");
const executedEvent = parseAbiItem("event CallExecuted(bytes32 indexed id,uint256 indexed index,address target,uint256 value,bytes data)");
const chunkedLogs = async (event, fromBlock, toBlock) => {
  const logs = [];
  for (let cursor = fromBlock; cursor <= toBlock; cursor += 10n) {
    const end = cursor + 9n < toBlock ? cursor + 9n : toBlock;
    logs.push(...await client.getLogs({ address: timelock, event, args: { id: operationId }, fromBlock: cursor, toBlock: end }));
    if (logs.length) break;
  }
  return logs;
};
const scheduledLogs = await chunkedLogs(scheduledEvent, scheduleFrom, scheduleTo);
const executedLogs = await chunkedLogs(executedEvent, executeFrom, executeTo);
if (scheduledLogs.length !== targets.length || executedLogs.length !== targets.length) {
  throw new Error(`Expected ${targets.length} scheduled/executed calls, received ${scheduledLogs.length}/${executedLogs.length}`);
}
const hashes = [...new Set([...scheduledLogs, ...executedLogs].map((log) => log.transactionHash))];
if (hashes.length !== 2) throw new Error(`Expected two Safe transactions, received ${hashes.length}`);
const receipts = await Promise.all(hashes.map((hash) => client.getTransactionReceipt({ hash })));
const transaction = (receipt) => ({
  hash: receipt.transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  blockHash: receipt.blockHash,
  transactionIndex: receipt.transactionIndex,
  from: receipt.from,
  to: receipt.to,
  status: receipt.status,
  gasUsed: receipt.gasUsed.toString(),
  effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
  transactionFeeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
  logCount: receipt.logs.length,
});
const evidence = {
  chain: "robinhood", network: "mainnet", chainId: 4663, operationId, salt,
  governanceSafe: getAddress(required("GOVERNANCE_SAFE_ADDRESS")), governanceTimelock: timelock,
  delaySeconds: Number(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS")),
  activation: {
    protectionPolicyRegistry: getAddress(required("PROTECTION_POLICY_REGISTRY_ADDRESS")), protectionPolicyId: "1",
    identityRegistry: getAddress(required("IDENTITY_REGISTRY_ADDRESS")), tickerLockSeconds: 300,
    protectionWindowSeconds: Number(required("SNIPER_TAX_DECAY_SECONDS")),
    initialFeeBps: Number(required("SNIPER_TAX_START_BPS")),
    maxBuyBpsPerTransaction: Number(required("MAX_BUY_BPS_PER_TRANSACTION")),
    maxBuyBpsPerAddress: Number(required("MAX_WALLET_BPS")),
  },
  transactions: receipts.sort((a, b) => Number(a.blockNumber - b.blockNumber)).map(transaction),
};
evidence.totalGasUsed = evidence.transactions.reduce((sum, tx) => sum + BigInt(tx.gasUsed), 0n).toString();
evidence.totalTransactionFeeWei = evidence.transactions.reduce((sum, tx) => sum + BigInt(tx.transactionFeeWei), 0n).toString();
writeFileSync(`${directory}/mainnet-protected-launch-activation.json`, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
