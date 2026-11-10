import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, keccak256, stringToHex, zeroHash } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const chainId = required("SQUEEZ_CHAIN_ID");
const safe = required("GOVERNANCE_SAFE_ADDRESS");
const timelock = required("GOVERNANCE_TIMELOCK_ADDRESS");
const delay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
const targets = [
  required("FACTORY_ADDRESS"), required("QUOTE_REGISTRY_ADDRESS"),
  required("PROTECTION_POLICY_REGISTRY_ADDRESS"), required("IDENTITY_REGISTRY_ADDRESS"),
  required("FEE_VAULT_ADDRESS"),
];
const values = targets.map(() => 0n);
const acceptOwnership = encodeFunctionData({
  abi: [{ type: "function", name: "acceptOwnership", stateMutability: "nonpayable", inputs: [], outputs: [] }],
  functionName: "acceptOwnership",
});
const payloads = targets.map(() => acceptOwnership);
const salt = keccak256(stringToHex(`Squeez Robinhood mainnet ownership handoff chain ${chainId}`));
const abi = [
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
const scheduleData = encodeFunctionData({ abi, functionName: "scheduleBatch",
  args: [targets, values, payloads, zeroHash, salt, delay] });
const executeData = encodeFunctionData({ abi, functionName: "executeBatch",
  args: [targets, values, payloads, zeroHash, salt] });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "packages/contracts/deployments/robinhood");
mkdirSync(directory, { recursive: true });
const builder = (name, description, data) => ({
  version: "1.0", chainId, createdAt: Date.now(),
  meta: { name, description, txBuilderVersion: "1.18.0", createdFromSafeAddress: safe,
    createdFromOwnerAddress: "" },
  transactions: [{ to: timelock, value: "0", data, contractMethod: null, contractInputsValues: null }],
});
writeFileSync(resolve(directory, "mainnet-safe-schedule-timelock-acceptance.json"),
  `${JSON.stringify(builder("Schedule Squeez ownership acceptance", "Schedules five acceptOwnership calls with the production 300-second delay.", scheduleData), null, 2)}\n`);
writeFileSync(resolve(directory, "mainnet-safe-execute-timelock-acceptance.json"),
  `${JSON.stringify(builder("Execute Squeez ownership acceptance", "Executes the five acceptOwnership calls after the production delay.", executeData), null, 2)}\n`);
console.log(JSON.stringify({ chainId, safe, timelock, delaySeconds: delay.toString(), targets, payloads, salt,
  scheduleData, executeData }, null, 2));
