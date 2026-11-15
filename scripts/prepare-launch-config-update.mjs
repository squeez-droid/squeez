#!/usr/bin/env node
// Prepares (never sends) a launch-config update that targets a >=$5k graduation market cap with a 10% price buffer.
// Only the graduation threshold and the virtual native reserve change; the virtual token
// reserve, sniper tax, max wallet and launch fee are copied from the config that is active on-chain.
//
//   node tools/with-env.mjs <chain> mainnet node scripts/prepare-launch-config-update.mjs           dry run, prints summary
//   node tools/with-env.mjs <chain> mainnet node scripts/prepare-launch-config-update.mjs --write   also writes files
//
// Robinhood is owned by the governance timelock, so the output is a Safe schedule + execute batch.
// HyperEVM and Elysium are owned by an EOA, so the output is one unsigned transaction for that owner.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, encodeFunctionData, formatEther, getAddress, http, keccak256, stringToHex, zeroHash,
} from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const chain = required("SQUEEZ_CHAIN");
if (required("SQUEEZ_NETWORK") !== "mainnet") throw new Error("Mainnet only");

// Native amounts in wei. mcap at graduation = (virtual + threshold)^2 / virtual = 4.9 x threshold for a 0.4 ratio.
const TARGETS = {
  robinhood: { chainId: 4663, threshold: 620_000_000_000_000_000n, symbol: "ETH", directory: "robinhood" },
  hyperevm: { chainId: 999, threshold: 17_000_000_000_000_000_000n, symbol: "HYPE", directory: "hyperevm" },
  elysium: { chainId: 99901, threshold: 17_000_000_000_000_000_000n, symbol: "HYPE", directory: "elysium" },
};
const target = TARGETS[chain];
if (!target) throw new Error(`Unsupported chain: ${chain}`);
if (Number(required("SQUEEZ_CHAIN_ID")) !== target.chainId) throw new Error("Unexpected chain ID for this target");

const factory = getAddress(required("FACTORY_ADDRESS"));
const configTuple = {
  name: "cfg", type: "tuple", components: [
    { name: "graduationThresholdHype", type: "uint256" }, { name: "virtualHypeReserve", type: "uint256" },
    { name: "virtualTokenReserve", type: "uint256" }, { name: "sniperTaxStartBps", type: "uint16" },
    { name: "sniperTaxDecaySeconds", type: "uint32" }, { name: "maxWalletBps", type: "uint16" },
    { name: "maxWalletWindowSeconds", type: "uint32" }, { name: "launchFeeHype", type: "uint256" },
  ],
};
const factoryAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchConfigs", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
    { type: "uint32" }, { type: "uint16" }, { type: "uint32" }, { type: "uint256" },
  ] },
  { type: "function", name: "setLaunchConfig", stateMutability: "nonpayable", inputs: [configTuple], outputs: [] },
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
const [actualChainId, owner, activeId] = await Promise.all([
  client.getChainId(),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "owner" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeConfigId" }),
]);
if (actualChainId !== target.chainId) throw new Error("RPC chain ID mismatch");
const current = await client.readContract({ address: factory, abi: factoryAbi, functionName: "launchConfigs", args: [activeId] });
const next = {
  graduationThresholdHype: target.threshold,
  virtualHypeReserve: target.threshold * 2n / 5n,
  virtualTokenReserve: current[2], sniperTaxStartBps: current[3], sniperTaxDecaySeconds: current[4],
  maxWalletBps: current[5], maxWalletWindowSeconds: current[6], launchFeeHype: current[7],
};
if (next.graduationThresholdHype * 2n % 5n !== 0n) throw new Error("Threshold must keep the 2/5 reserve ratio exact");
if (current[0] === next.graduationThresholdHype && current[1] === next.virtualHypeReserve) {
  throw new Error("The active config already has these values");
}

const calldata = encodeFunctionData({ abi: factoryAbi, functionName: "setLaunchConfig", args: [next] });
const mcapAtGraduation = (config) => (config.virtualHypeReserve + config.graduationThresholdHype) ** 2n / config.virtualHypeReserve;
const summary = {
  chain, chainId: target.chainId, factory, owner: getAddress(owner), symbol: target.symbol,
  activeConfigId: activeId.toString(), nextConfigId: (activeId + 1n).toString(),
  current: { threshold: formatEther(current[0]), virtualReserve: formatEther(current[1]) },
  next: { threshold: formatEther(next.graduationThresholdHype), virtualReserve: formatEther(next.virtualHypeReserve) },
  unchanged: {
    virtualTokenReserve: next.virtualTokenReserve.toString(), sniperTaxStartBps: next.sniperTaxStartBps,
    sniperTaxDecaySeconds: next.sniperTaxDecaySeconds, maxWalletBps: next.maxWalletBps,
    maxWalletWindowSeconds: next.maxWalletWindowSeconds, launchFee: formatEther(next.launchFeeHype),
  },
  marketCapAtGraduation: {
    current: formatEther(mcapAtGraduation({ graduationThresholdHype: current[0], virtualHypeReserve: current[1] })),
    next: formatEther(mcapAtGraduation(next)),
  },
  calldata,
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "packages/contracts/deployments", target.directory);
const write = process.argv.includes("--write");
const stamp = Date.now();
const safe = process.env.GOVERNANCE_SAFE_ADDRESS?.trim();
const timelock = process.env.GOVERNANCE_TIMELOCK_ADDRESS?.trim();

if (timelock && getAddress(owner) === getAddress(timelock)) {
  // Governed path: Safe -> timelock -> factory.
  const safeAddress = getAddress(safe ?? required("GOVERNANCE_SAFE_ADDRESS"));
  const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
  const onchainDelay = await client.readContract({ address: getAddress(timelock), abi: timelockAbi, functionName: "getMinDelay" });
  if (onchainDelay !== delay) throw new Error("Timelock delay mismatch");
  const targets = [factory];
  const values = [0n];
  const payloads = [calldata];
  const salt = keccak256(stringToHex(`Squeez ${chain} mainnet launch config ${activeId + 1n} threshold ${formatEther(next.graduationThresholdHype)}`));
  const scheduleData = encodeFunctionData({ abi: timelockAbi, functionName: "scheduleBatch", args: [targets, values, payloads, zeroHash, salt, delay] });
  const executeData = encodeFunctionData({ abi: timelockAbi, functionName: "executeBatch", args: [targets, values, payloads, zeroHash, salt] });
  await client.call({ account: safeAddress, to: getAddress(timelock), data: scheduleData }); // schedule must be valid from the Safe
  summary.path = "safe-timelock"; summary.safe = safeAddress; summary.timelock = getAddress(timelock);
  summary.delaySeconds = delay.toString(); summary.salt = salt; summary.scheduleSimulation = true;
  const builder = (name, description, data) => ({
    version: "1.0", chainId: String(target.chainId), createdAt: stamp,
    meta: { name, description, txBuilderVersion: "1.18.0", createdFromSafeAddress: safeAddress, createdFromOwnerAddress: "" },
    transactions: [{ to: getAddress(timelock), value: "0", data, contractMethod: null, contractInputsValues: null }],
  });
  if (write) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "mainnet-safe-schedule-launch-config-5k-buffer.json"), `${JSON.stringify(builder(
      "Schedule Squeez >=$5k buffered graduation",
      `Schedules launch config #${activeId + 1n}: threshold ${formatEther(next.graduationThresholdHype)} ${target.symbol}.`, scheduleData), null, 2)}\n`);
    writeFileSync(resolve(directory, "mainnet-safe-execute-launch-config-5k-buffer.json"), `${JSON.stringify(builder(
      "Execute Squeez >=$5k buffered graduation",
      `Activates launch config #${activeId + 1n} after the governance delay.`, executeData), null, 2)}\n`);
    summary.wroteFiles = true;
  }
} else {
  // Direct path: the factory owner is a single account. Simulate as that account; nothing is sent.
  await client.call({ account: getAddress(owner), to: factory, data: calldata });
  summary.path = "owner-eoa"; summary.ownerSimulation = true;
  summary.warning = "Owner is a single account without a timelock; the change takes effect immediately when it is sent.";
  if (write) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "mainnet-launch-config-5k-buffer-prepared.json"), `${JSON.stringify({
      note: "Prepared, NOT sent. Send from the factory owner only after explicit approval.",
      chainId: target.chainId, from: getAddress(owner), to: factory, value: "0", data: calldata,
      expectedActiveConfigId: (activeId + 1n).toString(), config: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.toString()])),
    }, null, 2)}\n`);
    summary.wroteFiles = true;
  }
}
console.log(JSON.stringify(summary, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
