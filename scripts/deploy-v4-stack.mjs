import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const required = (name) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; };
const network = required("SQUEEZ_NETWORK");
const chain = required("SQUEEZ_CHAIN");
if (network !== "testnet") throw new Error("self-hosted v4 deployment is testnet-only");
if (required("V4_LP_FEE_BPS") !== "0" || required("V4_TICK_SPACING") !== "60") throw new Error("expected fee=0 and tickSpacing=60");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const legacyElysiumOutput = chain === "elysium" ? `packages/contracts/deployments/${network}-v4-stack.json` : null;
const output = resolve(root, legacyElysiumOutput ?? `packages/contracts/deployments/${chain}/${network}-v4-stack.json`);
if (existsSync(output)) throw new Error(`${output} already exists; refusing duplicate v4 deployment`);
const key = process.env.DEPLOYER_PRIVATE_KEY?.trim() || required("UPGRADE_ADMIN_PRIVATE_KEY");
const account = privateKeyToAccount(key);
const rpc = required("SQUEEZ_RPC");
const publicClient = createPublicClient({ transport: http(rpc) });
const walletClient = createWalletClient({ account, transport: http(rpc) });
const chainId = await publicClient.getChainId();
if (chainId !== Number(required("SQUEEZ_CHAIN_ID"))) throw new Error("chain id mismatch");
const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
if (!(await publicClient.getBytecode({ address: permit2 }))) throw new Error("canonical Permit2 unavailable");

const artifact = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const artifacts = {
  poolManager: artifact("node_modules/@uniswap/v4-core/out/PoolManager.sol/PoolManager.json"),
  wrappedNative: artifact("packages/contracts/out/SqueezWrappedHype.sol/SqueezWrappedHype.json"),
  positionDescriptor: artifact("node_modules/@uniswap/v4-periphery/foundry-out/PositionDescriptor.sol/PositionDescriptor.json"),
  positionManager: artifact("node_modules/@uniswap/v4-periphery/foundry-out/PositionManager.sol/PositionManager.json"),
  stateView: artifact("node_modules/@uniswap/v4-periphery/foundry-out/StateView.sol/StateView.json"),
  v4Quoter: artifact("node_modules/@uniswap/v4-periphery/foundry-out/V4Quoter.sol/V4Quoter.json"),
};
const deployments = {};
const transactions = [];
async function deploy(name, args) {
  const entry = artifacts[name];
  const hash = await walletClient.deployContract({ abi: entry.abi, bytecode: entry.bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${name} deployment failed: ${hash}`);
  const tx = await publicClient.getTransaction({ hash });
  deployments[name] = receipt.contractAddress;
  transactions.push({ name, hash, contractAddress: receipt.contractAddress, blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash, from: receipt.from, nonce: tx.nonce, gasLimit: tx.gas.toString(),
    gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
    transactionFeeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(), status: receipt.status });
  console.log(`${name}: ${receipt.contractAddress} (${hash})`);
  return receipt.contractAddress;
}

const admin = required("ADMIN_MULTISIG");
const poolManager = await deploy("poolManager", [admin]);
const wrappedNative = await deploy("wrappedNative", []);
const nativeSymbol = chain === "robinhood" ? "ETH" : "HYPE";
const positionDescriptor = await deploy("positionDescriptor", [poolManager, wrappedNative, stringToHex(nativeSymbol, { size: 32 })]);
const positionManager = await deploy("positionManager", [poolManager, permit2, 100_000n, positionDescriptor, wrappedNative]);
await deploy("stateView", [poolManager]);
await deploy("v4Quoter", [poolManager]);

const result = { chain, network, chainId, nativeSymbol, generatedAt: new Date().toISOString(), deployer: account.address, admin,
  v4CoreVersion: "1.0.2", v4CoreCommit: "59d3ecf53afa9264a16bba0e38f4c5d2231f80bc",
  v4PeripheryVersion: "1.0.3", v4PeripheryCommit: "60cd93803ac2b7fa65fd6cd351fd5fd4cc8c9db5",
  permit2, ...deployments, lpFeeBps: 0, tickSpacing: 60,
  totalGasUsed: transactions.reduce((sum, tx) => sum + BigInt(tx.gasUsed), 0n).toString(), transactions };
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${output}`);
