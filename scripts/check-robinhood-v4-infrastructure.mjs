import { createPublicClient, http, isAddress } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (!isAddress(value)) throw new Error(`${name} is not an address`);
  return value;
};
const expectedChainId = Number(process.env.SQUEEZ_CHAIN_ID);
if (expectedChainId !== 4663) throw new Error("This check is restricted to Robinhood mainnet chain 4663");
const addresses = {
  poolManager: required("POOL_MANAGER"),
  positionManager: required("POSITION_MANAGER"),
  permit2: required("PERMIT2"),
  universalRouter: required("UNIVERSAL_ROUTER"),
  wrappedNative: required("WRAPPED_NATIVE_ADDRESS"),
  positionDescriptor: required("POSITION_DESCRIPTOR_ADDRESS"),
  stateView: required("V4_STATE_VIEW_ADDRESS"),
  quoter: required("V4_QUOTER_ADDRESS"),
};
const client = createPublicClient({ transport: http(process.env.SQUEEZ_RPC) });
if (await client.getChainId() !== expectedChainId) throw new Error("RPC chain ID mismatch");
const bytecodes = await Promise.all(Object.values(addresses).map((address) => client.getBytecode({ address })));
const codeSizes = Object.fromEntries(Object.keys(addresses).map((name, index) => {
  const code = bytecodes[index];
  if (!code || code === "0x") throw new Error(`${name} has no bytecode`);
  return [name, (code.length - 2) / 2];
}));

const addressOutput = [{ type: "address" }];
const uint8Output = [{ type: "uint8" }];
const bytes32Output = [{ type: "bytes32" }];
const poolManagerAbi = [{ type: "function", name: "poolManager", stateMutability: "view", inputs: [], outputs: addressOutput }];
const erc20Abi = [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: uint8Output }];
const permit2Abi = [{ type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: bytes32Output }];
const [positionManagerPoolManager, stateViewPoolManager, quoterPoolManager, wrappedDecimals, permit2Domain] = await Promise.all([
  client.readContract({ address: addresses.positionManager, abi: poolManagerAbi, functionName: "poolManager" }),
  client.readContract({ address: addresses.stateView, abi: poolManagerAbi, functionName: "poolManager" }),
  client.readContract({ address: addresses.quoter, abi: poolManagerAbi, functionName: "poolManager" }),
  client.readContract({ address: addresses.wrappedNative, abi: erc20Abi, functionName: "decimals" }),
  client.readContract({ address: addresses.permit2, abi: permit2Abi, functionName: "DOMAIN_SEPARATOR" }),
]);
for (const [name, value] of Object.entries({ positionManagerPoolManager, stateViewPoolManager, quoterPoolManager })) {
  if (value.toLowerCase() !== addresses.poolManager.toLowerCase()) throw new Error(`${name} wiring mismatch`);
}
if (wrappedDecimals !== 18) throw new Error(`Wrapped native decimals mismatch: ${wrappedDecimals}`);
if (!permit2Domain || /^0x0+$/.test(permit2Domain)) throw new Error("Permit2 DOMAIN_SEPARATOR is invalid");
console.log(JSON.stringify({
  ready: true,
  chainId: expectedChainId,
  addresses,
  codeSizes,
  checks: { positionManagerPoolManager: true, stateViewPoolManager: true, quoterPoolManager: true,
    wrappedNativeDecimals: wrappedDecimals, permit2DomainSeparator: true },
}, null, 2));
