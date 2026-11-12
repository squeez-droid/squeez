import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mkdirSync, writeFileSync } from "node:fs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const token = process.env.E2E_TOKEN_ADDRESS ?? "0xbf11681b28508e4e792ff38e53bF0aC7cBe0DbbE";
const curve = process.env.E2E_CURVE_ADDRESS ?? "0xDab85B6Df9f1dF598B39d4e410E01FcCa716B5a5";
const locker = required("LIQUIDITY_LOCKER_ADDRESS");
const chain = required("SQUEEZ_CHAIN");
const account = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY"));
const transport = http(required("SQUEEZ_RPC"));
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });
const curveAbi = [
  { type: "function", name: "launchedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "config", stateMutability: "view", inputs: [], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
    { type: "uint32" }, { type: "uint16" }, { type: "uint32" }, { type: "uint256" },
  ] },
  { type: "function", name: "hypeRaised", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduated", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "graduationState", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "graduationPool", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "graduate", stateMutability: "nonpayable", inputs: [], outputs: [] },
];
const lockerAbi = [
  { type: "function", name: "isLocked", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "positionForToken", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lockedTokenAmount", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lockedNativeAmount", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];

const [launchedAt, config, block] = await Promise.all([
  publicClient.readContract({ address: curve, abi: curveAbi, functionName: "launchedAt" }),
  publicClient.readContract({ address: curve, abi: curveAbi, functionName: "config" }),
  publicClient.getBlock(),
]);
const tradeReadyAt = launchedAt + BigInt(config[6]);
if (block.timestamp < tradeReadyAt) {
  console.log(JSON.stringify({ ready: false, waitSeconds: Number(tradeReadyAt - block.timestamp), launchedAt: launchedAt.toString() }));
  process.exit(2);
}

const buyHash = await walletClient.writeContract({
  address: curve,
  abi: curveAbi,
  functionName: "buy",
  args: [0n, block.timestamp + 300n],
  value: parseEther(process.env.E2E_GRADUATION_BUY_AMOUNT_NATIVE?.trim() || "0.12"),
});
const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });
if (buyReceipt.status !== "success") throw new Error(`Closing buy reverted: ${buyHash}`);
const closed = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduated" });
if (!closed) throw new Error("Curve did not close at the configured threshold");

const graduationHash = await walletClient.writeContract({ address: curve, abi: curveAbi, functionName: "graduate" });
const graduationReceipt = await publicClient.waitForTransactionReceipt({ hash: graduationHash });
if (graduationReceipt.status !== "success") throw new Error(`Graduation reverted: ${graduationHash}`);
const [graduationState, pool, isLocked, positionId, lockedTokens, lockedNative] = await Promise.all([
  publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduationState" }),
  publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduationPool" }),
  publicClient.readContract({ address: locker, abi: lockerAbi, functionName: "isLocked", args: [token] }),
  publicClient.readContract({ address: locker, abi: lockerAbi, functionName: "positionForToken", args: [token] }),
  publicClient.readContract({ address: locker, abi: lockerAbi, functionName: "lockedTokenAmount", args: [token] }),
  publicClient.readContract({ address: locker, abi: lockerAbi, functionName: "lockedNativeAmount", args: [token] }),
]);
if (graduationState !== 2 || !isLocked || positionId === 0n) throw new Error("Graduation lock verification failed");
const expectedLockedTokens = 1_000_000_000n * 10n ** 18n * 4n / 49n;
const lockDifference = lockedTokens > expectedLockedTokens
  ? lockedTokens - expectedLockedTokens
  : expectedLockedTokens - lockedTokens;
if (lockDifference > 100_000n) throw new Error("Locked residual does not match the required 4/49 supply");
const evidence = {
  token, curve, locker, pool, positionId: positionId.toString(),
  buyHash, buyBlock: buyReceipt.blockNumber.toString(),
  graduationHash, graduationBlock: graduationReceipt.blockNumber.toString(),
  lockedTokens: lockedTokens.toString(), expectedLockedTokens: expectedLockedTokens.toString(),
  lockDifference: lockDifference.toString(), lockedNative: lockedNative.toString(),
};
mkdirSync("docs/evidence/phase-5", { recursive: true });
writeFileSync(`docs/evidence/phase-5/${chain}-testnet-graduation.json`, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
