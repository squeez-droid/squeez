import { createPublicClient, encodeFunctionData, http, keccak256, stringToHex, zeroHash } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const chainId = required("SQUEEZ_CHAIN_ID");
const timelock = required("GOVERNANCE_TIMELOCK_ADDRESS");
const targets = [required("FACTORY_ADDRESS"), required("QUOTE_REGISTRY_ADDRESS"),
  required("PROTECTION_POLICY_REGISTRY_ADDRESS"), required("IDENTITY_REGISTRY_ADDRESS"),
  required("FEE_VAULT_ADDRESS")];
const values = targets.map(() => 0n);
const payload = encodeFunctionData({ abi: [{ type: "function", name: "acceptOwnership", stateMutability: "nonpayable",
  inputs: [], outputs: [] }], functionName: "acceptOwnership" });
const payloads = targets.map(() => payload);
const salt = keccak256(stringToHex(`Squeez Robinhood mainnet ownership handoff chain ${chainId}`));
const abi = [
  { type: "function", name: "hashOperationBatch", stateMutability: "pure", inputs: [
    { type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }, { type: "bytes32" }, { type: "bytes32" },
  ], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "getTimestamp", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isOperationPending", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isOperationReady", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "isOperationDone", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }] },
];
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const operationId = await client.readContract({ address: timelock, abi, functionName: "hashOperationBatch",
  args: [targets, values, payloads, zeroHash, salt] });
const [readyAt, pending, ready, done, block] = await Promise.all([
  client.readContract({ address: timelock, abi, functionName: "getTimestamp", args: [operationId] }),
  client.readContract({ address: timelock, abi, functionName: "isOperationPending", args: [operationId] }),
  client.readContract({ address: timelock, abi, functionName: "isOperationReady", args: [operationId] }),
  client.readContract({ address: timelock, abi, functionName: "isOperationDone", args: [operationId] }),
  client.getBlock(),
]);
const secondsRemaining = readyAt > block.timestamp ? readyAt - block.timestamp : 0n;
console.log(JSON.stringify({ operationId, salt, pending, ready, done, scheduled: readyAt > 1n,
  readyAt: readyAt.toString(), readyAtIso: readyAt > 1n ? new Date(Number(readyAt) * 1000).toISOString() : null,
  chainTimestamp: block.timestamp.toString(), secondsRemaining: secondsRemaining.toString() }, null, 2));
if (!pending && !ready && !done) process.exitCode = 2;
