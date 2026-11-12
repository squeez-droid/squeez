import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, decodeFunctionData, getAddress, http } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const chain = required("SQUEEZ_CHAIN");
const network = required("SQUEEZ_NETWORK");
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (chain !== "robinhood" || network !== "mainnet" || chainId !== 4663) {
  throw new Error("v4 activation verification is restricted to Robinhood mainnet");
}

const directory = resolve("packages/contracts/deployments/robinhood");
const activation = JSON.parse(readFileSync(resolve(directory, "mainnet-v4-activation.json"), "utf8"));
const executionBatch = JSON.parse(
  readFileSync(resolve(directory, "mainnet-safe-execute-v4-activation.json"), "utf8"),
);
const transaction = executionBatch.transactions[0];
const timelockAbi = [
  {
    type: "function", name: "executeBatch", stateMutability: "payable",
    inputs: [
      { name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" },
      { name: "payloads", type: "bytes[]" }, { name: "predecessor", type: "bytes32" },
      { name: "salt", type: "bytes32" },
    ], outputs: [],
  },
  {
    type: "function", name: "hashOperationBatch", stateMutability: "pure",
    inputs: [
      { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" },
      { type: "bytes32" }, { type: "bytes32" },
    ], outputs: [{ type: "bytes32" }],
  },
  {
    type: "function", name: "isOperationDone", stateMutability: "view",
    inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }],
  },
];
const vaultAbi = [
  { type: "function", name: "hook", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const factoryAbi = [
  {
    type: "function", name: "graduationAdapter", stateMutability: "view",
    inputs: [], outputs: [{ type: "address" }],
  },
];

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
if (await client.getChainId() !== chainId) throw new Error("RPC chain ID mismatch");
const decoded = decodeFunctionData({ abi: timelockAbi, data: transaction.data });
const operationId = await client.readContract({
  address: transaction.to,
  abi: timelockAbi,
  functionName: "hashOperationBatch",
  args: decoded.args,
});
if (operationId.toLowerCase() !== activation.operationId.toLowerCase()) {
  throw new Error("recorded v4 operation ID does not match the execution batch");
}

const receiptHashes = activation.transactions.map(({ hash }) => hash);
const [done, activeHook, activeAdapter, ...receipts] = await Promise.all([
  client.readContract({
    address: activation.governanceTimelock,
    abi: timelockAbi,
    functionName: "isOperationDone",
    args: [operationId],
  }),
  client.readContract({
    address: activation.activation.feeVault,
    abi: vaultAbi,
    functionName: "hook",
  }),
  client.readContract({
    address: activation.activation.factory,
    abi: factoryAbi,
    functionName: "graduationAdapter",
  }),
  ...receiptHashes.map((hash) => client.getTransactionReceipt({ hash })),
]);

if (!done) throw new Error("v4 activation operation is not done");
if (getAddress(activeHook) !== getAddress(activation.activation.hook)) throw new Error("FeeVault Hook mismatch");
if (getAddress(activeAdapter) !== getAddress(activation.activation.graduationAdapter)) {
  throw new Error("Factory GraduationAdapter mismatch");
}
if (receipts.some((receipt) => receipt.status !== "success")) throw new Error("v4 activation receipt failed");

console.log(JSON.stringify({
  ready: true,
  chainId,
  operationId,
  operationDone: done,
  activeHook: getAddress(activeHook),
  activeGraduationAdapter: getAddress(activeAdapter),
  receipts: receipts.map((receipt) => ({
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  })),
}, null, 2));
