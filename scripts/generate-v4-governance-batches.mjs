import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  stringToHex,
  zeroHash,
} from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const same = (left, right) => getAddress(left) === getAddress(right);

if (required("SQUEEZ_CHAIN") !== "robinhood" || required("SQUEEZ_NETWORK") !== "mainnet") {
  throw new Error("v4 governance batches are restricted to Robinhood mainnet");
}

const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (chainId !== 4663) throw new Error(`unexpected Robinhood mainnet chain ID: ${chainId}`);

const safe = getAddress(required("GOVERNANCE_SAFE_ADDRESS"));
const timelock = getAddress(required("GOVERNANCE_TIMELOCK_ADDRESS"));
const feeVault = getAddress(required("FEE_VAULT_ADDRESS"));
const factory = getAddress(required("FACTORY_ADDRESS"));
const hook = getAddress(required("SQUEEZ_HOOK_ADDRESS"));
const adapter = getAddress(required("GRADUATION_ADAPTER_ADDRESS"));
const poolManager = getAddress(required("POOL_MANAGER"));
const positionManager = getAddress(required("POSITION_MANAGER"));
const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
if (delay < 300n) throw new Error("mainnet governance delay must be at least 300 seconds");

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const actualChainId = await client.getChainId();
if (actualChainId !== chainId) throw new Error(`RPC chain ID mismatch: ${actualChainId}`);

const addressCode = await Promise.all(
  [safe, timelock, feeVault, factory, hook, adapter, poolManager, positionManager].map((address) =>
    client.getBytecode({ address }),
  ),
);
if (addressCode.some((code) => !code || code === "0x")) throw new Error("one or more governance/v4 addresses have no bytecode");

const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const hookAbi = [
  { type: "function", name: "poolManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "feeVault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const adapterAbi = [
  { type: "function", name: "positionManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "hook", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const timelockAbi = [
  { type: "function", name: "getMinDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "scheduleBatch", stateMutability: "nonpayable", inputs: [
    { name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" },
    { name: "payloads", type: "bytes[]" }, { name: "predecessor", type: "bytes32" },
    { name: "salt", type: "bytes32" }, { name: "delay", type: "uint256" },
  ], outputs: [] },
  { type: "function", name: "executeBatch", stateMutability: "payable", inputs: [
    { name: "targets", type: "address[]" }, { name: "values", type: "uint256[]" },
    { name: "payloads", type: "bytes[]" }, { name: "predecessor", type: "bytes32" },
    { name: "salt", type: "bytes32" },
  ], outputs: [] },
];
const [vaultOwner, factoryOwner, hookManager, hookVault, adapterManager, adapterHook, onchainDelay] = await Promise.all([
  client.readContract({ address: feeVault, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: factory, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: hook, abi: hookAbi, functionName: "poolManager" }),
  client.readContract({ address: hook, abi: hookAbi, functionName: "feeVault" }),
  client.readContract({ address: adapter, abi: adapterAbi, functionName: "positionManager" }),
  client.readContract({ address: adapter, abi: adapterAbi, functionName: "hook" }),
  client.readContract({ address: timelock, abi: timelockAbi, functionName: "getMinDelay" }),
]);

if (!same(vaultOwner, timelock) || !same(factoryOwner, timelock)) throw new Error("factory and FeeVault must be owned by the governance timelock");
if (!same(hookManager, poolManager) || !same(hookVault, feeVault)) throw new Error("SqueezHook wiring mismatch");
if (!same(adapterManager, positionManager) || !same(adapterHook, hook)) throw new Error("graduation adapter wiring mismatch");
if (onchainDelay !== delay) throw new Error(`timelock delay mismatch: expected ${delay}, received ${onchainDelay}`);

const targets = [feeVault, factory];
const values = [0n, 0n];
const payloads = [
  encodeFunctionData({
    abi: [{ type: "function", name: "setHook", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] }],
    functionName: "setHook",
    args: [hook],
  }),
  encodeFunctionData({
    abi: [{ type: "function", name: "setGraduationAdapter", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] }],
    functionName: "setGraduationAdapter",
    args: [adapter],
  }),
];
const salt = keccak256(stringToHex(`Squeez Robinhood mainnet v4 activation ${hook} ${adapter}`));
const scheduleData = encodeFunctionData({
  abi: timelockAbi,
  functionName: "scheduleBatch",
  args: [targets, values, payloads, zeroHash, salt, delay],
});
const executeData = encodeFunctionData({
  abi: timelockAbi,
  functionName: "executeBatch",
  args: [targets, values, payloads, zeroHash, salt],
});
const builder = (name, description, data) => ({
  version: "1.0",
  chainId: String(chainId),
  createdAt: Date.now(),
  meta: {
    name,
    description,
    txBuilderVersion: "1.18.0",
    createdFromSafeAddress: safe,
    createdFromOwnerAddress: "",
  },
  transactions: [{ to: timelock, value: "0", data, contractMethod: null, contractInputsValues: null }],
});

const summary = {
  chainId,
  safe,
  timelock,
  delaySeconds: delay.toString(),
  targets,
  hook,
  adapter,
  salt,
  scheduleData,
  executeData,
};

if (process.argv.includes("--write")) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const directory = resolve(root, "packages/contracts/deployments/robinhood");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "mainnet-safe-schedule-v4-activation.json"),
    `${JSON.stringify(builder("Schedule Squeez v4 activation", "Authorizes the Squeez hook and graduation adapter after the production timelock delay.", scheduleData), null, 2)}\n`,
  );
  writeFileSync(
    resolve(directory, "mainnet-safe-execute-v4-activation.json"),
    `${JSON.stringify(builder("Execute Squeez v4 activation", "Executes hook and graduation adapter activation after the timelock delay.", executeData), null, 2)}\n`,
  );
  summary.wroteFiles = true;
}

console.log(JSON.stringify(summary, null, 2));
