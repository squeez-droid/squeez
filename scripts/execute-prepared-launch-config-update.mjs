#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, decodeFunctionData, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (!process.argv.includes("--send")) throw new Error("Refusing to send without --send");
const chain = required("SQUEEZ_CHAIN");
if (required("SQUEEZ_NETWORK") !== "mainnet") throw new Error("Mainnet only");
if (!["hyperevm", "elysium"].includes(chain)) throw new Error("Only direct-owner HyperEVM/Elysium updates are supported");

const file = resolve("packages/contracts/deployments", chain, "mainnet-launch-config-5k-buffer-prepared.json");
const prepared = JSON.parse(await readFile(file, "utf8"));
if (prepared.sent) throw new Error(`Prepared transaction was already sent: ${prepared.sent.transactionHash}`);

const candidateKeys = [process.env.DEPLOYER_PRIVATE_KEY, process.env.UPGRADE_ADMIN_PRIVATE_KEY]
  .map((value) => value?.trim()).filter(Boolean);
const account = candidateKeys.map((key) => privateKeyToAccount(key))
  .find((candidate) => candidate.address === getAddress(prepared.from));
if (!account) throw new Error("No configured signer matches the prepared Factory owner");
const rpc = required("SQUEEZ_RPC");
const factory = getAddress(required("FACTORY_ADDRESS"));
if (getAddress(prepared.from) !== account.address) throw new Error("Prepared sender does not match deployer key");
if (getAddress(prepared.to) !== factory) throw new Error("Prepared target does not match Factory");
if (Number(prepared.chainId) !== Number(required("SQUEEZ_CHAIN_ID"))) throw new Error("Prepared chain ID mismatch");

const tuple = {
  name: "cfg", type: "tuple", components: [
    { name: "graduationThresholdHype", type: "uint256" }, { name: "virtualHypeReserve", type: "uint256" },
    { name: "virtualTokenReserve", type: "uint256" }, { name: "sniperTaxStartBps", type: "uint16" },
    { name: "sniperTaxDecaySeconds", type: "uint32" }, { name: "maxWalletBps", type: "uint16" },
    { name: "maxWalletWindowSeconds", type: "uint32" }, { name: "launchFeeHype", type: "uint256" },
  ],
};
const abi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "setLaunchConfig", stateMutability: "nonpayable", inputs: [tuple], outputs: [] },
];
const decoded = decodeFunctionData({ abi, data: prepared.data });
if (decoded.functionName !== "setLaunchConfig") throw new Error("Prepared calldata is not setLaunchConfig");
const publicClient = createPublicClient({ transport: http(rpc) });
const walletClient = createWalletClient({ account, transport: http(rpc) });
const [chainId, owner, activeBefore] = await Promise.all([
  publicClient.getChainId(),
  publicClient.readContract({ address: factory, abi, functionName: "owner" }),
  publicClient.readContract({ address: factory, abi, functionName: "activeConfigId" }),
]);
if (chainId !== Number(prepared.chainId)) throw new Error("RPC chain ID mismatch");
if (getAddress(owner) !== account.address) throw new Error("Deployer is not the Factory owner");
if (activeBefore + 1n !== BigInt(prepared.expectedActiveConfigId)) throw new Error("Unexpected active config ID");

await publicClient.call({ account: account.address, to: factory, data: prepared.data });
const hash = await walletClient.sendTransaction({ account, to: factory, data: prepared.data, value: 0n });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
const activeAfter = await publicClient.readContract({ address: factory, abi, functionName: "activeConfigId" });
if (activeAfter !== BigInt(prepared.expectedActiveConfigId)) throw new Error("New launch config was not activated");

prepared.note = "SENT and confirmed. See sent.";
prepared.sent = {
  transactionHash: hash,
  blockNumber: Number(receipt.blockNumber),
  gasUsed: receipt.gasUsed.toString(),
  status: receipt.status,
  activeConfigIdAfter: Number(activeAfter),
};
await writeFile(file, `${JSON.stringify(prepared, null, 2)}\n`);
console.log(JSON.stringify({ chain, factory, ...prepared.sent }, null, 2));
