import { createPublicClient, http, isAddress } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required before graduation infrastructure deployment`);
  return value;
};
const names = [
  "POOL_MANAGER", "POSITION_MANAGER", "PERMIT2", "WRAPPED_NATIVE_ADDRESS", "V4_STATE_VIEW_ADDRESS",
  "V4_QUOTER_ADDRESS", "LIQUIDITY_LOCKER_ADDRESS", "SQUEEZ_HOOK_ADDRESS", "FEE_VAULT_ADDRESS",
  "GRADUATION_ADAPTER_ADDRESS", "FACTORY_ADDRESS",
];
const addresses = Object.fromEntries(names.map((name) => [name, required(name)]));
for (const [name, address] of Object.entries(addresses)) {
  if (!isAddress(address)) throw new Error(`${name} is not a valid address`);
}
const feeBps = Number(required("V4_LP_FEE_BPS"));
const tickSpacing = Number(required("V4_TICK_SPACING"));
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new Error("V4_LP_FEE_BPS must be 0..10000");
if (!Number.isInteger(tickSpacing) || tickSpacing <= 0 || tickSpacing > 32767) {
  throw new Error("V4_TICK_SPACING must be 1..32767");
}
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const expectedChainId = Number(required("SQUEEZ_CHAIN_ID"));
const [chainId, ...bytecodes] = await Promise.all([
  client.getChainId(),
  ...Object.values(addresses).map((address) => client.getBytecode({ address })),
]);
if (chainId !== expectedChainId) throw new Error(`RPC chain mismatch: expected ${expectedChainId}, got ${chainId}`);
for (let index = 0; index < names.length; index++) {
  if (!bytecodes[index] || bytecodes[index] === "0x") throw new Error(`${names[index]} has no contract bytecode`);
}
const hookAbi = [
  { type: "function", name: "poolManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "feeVault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const vaultAbi = [
  { type: "function", name: "hook", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const adapterAbi = [
  { type: "function", name: "positionManager", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "permit2", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "locker", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "hook", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const factoryAbi = [
  { type: "function", name: "graduationAdapter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const [hookManager, hookVault, authorizedHook, adapterManager, adapterPermit2, adapterLocker, adapterHook, activeAdapter] = await Promise.all([
  client.readContract({ address: addresses.SQUEEZ_HOOK_ADDRESS, abi: hookAbi, functionName: "poolManager" }),
  client.readContract({ address: addresses.SQUEEZ_HOOK_ADDRESS, abi: hookAbi, functionName: "feeVault" }),
  client.readContract({ address: addresses.FEE_VAULT_ADDRESS, abi: vaultAbi, functionName: "hook" }),
  client.readContract({ address: addresses.GRADUATION_ADAPTER_ADDRESS, abi: adapterAbi, functionName: "positionManager" }),
  client.readContract({ address: addresses.GRADUATION_ADAPTER_ADDRESS, abi: adapterAbi, functionName: "permit2" }),
  client.readContract({ address: addresses.GRADUATION_ADAPTER_ADDRESS, abi: adapterAbi, functionName: "locker" }),
  client.readContract({ address: addresses.GRADUATION_ADAPTER_ADDRESS, abi: adapterAbi, functionName: "hook" }),
  client.readContract({ address: addresses.FACTORY_ADDRESS, abi: factoryAbi, functionName: "graduationAdapter" }),
]);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
if (!same(hookManager, addresses.POOL_MANAGER)) throw new Error("SqueezHook PoolManager wiring mismatch");
if (!same(hookVault, addresses.FEE_VAULT_ADDRESS)) throw new Error("SqueezHook FeeVault wiring mismatch");
if (!same(authorizedHook, addresses.SQUEEZ_HOOK_ADDRESS)) throw new Error("FeeVault has not authorized SqueezHook");
if (!same(adapterManager, addresses.POSITION_MANAGER)) throw new Error("Graduation adapter PositionManager mismatch");
if (!same(adapterPermit2, addresses.PERMIT2)) throw new Error("Graduation adapter Permit2 mismatch");
if (!same(adapterLocker, addresses.LIQUIDITY_LOCKER_ADDRESS)) throw new Error("Graduation adapter locker mismatch");
if (!same(adapterHook, addresses.SQUEEZ_HOOK_ADDRESS)) throw new Error("Graduation adapter hook mismatch");
if (!same(activeAdapter, addresses.GRADUATION_ADAPTER_ADDRESS)) throw new Error("Factory graduation adapter mismatch");
const expectedHookFlags = 0x20ccn;
if ((BigInt(addresses.SQUEEZ_HOOK_ADDRESS) & 0x3fffn) !== expectedHookFlags) {
  throw new Error("SqueezHook address permission bits mismatch");
}
console.log(JSON.stringify({ ready: true, chainId, contractsWithBytecode: names, feeBps, tickSpacing }, null, 2));
