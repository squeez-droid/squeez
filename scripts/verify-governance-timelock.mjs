import { createPublicClient, http, isAddress, keccak256, stringToHex } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const timelock = required("GOVERNANCE_TIMELOCK_ADDRESS");
const safe = required("GOVERNANCE_SAFE_ADDRESS");
if (!isAddress(timelock) || !isAddress(safe)) throw new Error("Invalid timelock or Safe address");
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const code = await client.getCode({ address: timelock });
if (!code || code === "0x") throw new Error("Timelock has no bytecode");
const abi = [
  { type: "function", name: "getMinDelay", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "bool" }] },
];
const role = (name) => keccak256(stringToHex(name));
const roles = {
  proposer: role("PROPOSER_ROLE"), executor: role("EXECUTOR_ROLE"), canceller: role("CANCELLER_ROLE"),
  admin: `0x${"00".repeat(32)}`,
};
const [delay, proposer, executor, canceller, admin] = await Promise.all([
  client.readContract({ address: timelock, abi, functionName: "getMinDelay" }),
  ...Object.values(roles).map((roleId) => client.readContract({ address: timelock, abi,
    functionName: "hasRole", args: [roleId, safe] })),
]);
const expectedDelay = BigInt(required("GOVERNANCE_TIMELOCK_DELAY_SECONDS"));
const checks = { bytecode: true, delay: delay === expectedDelay, proposer, executor, canceller, admin };
console.log(JSON.stringify({ timelock, safe, delaySeconds: delay.toString(), checks }, null, 2));
if (Object.values(checks).some((value) => value !== true)) process.exitCode = 2;
