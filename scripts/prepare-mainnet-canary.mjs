#!/usr/bin/env node

import pg from "pg";
import { createPublicClient, formatEther, getAddress, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("Canary preparation is restricted to Robinhood mainnet");
}
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (Number(required("SQUEEZ_CHAIN_ID")) !== 4663) throw new Error("Unexpected Robinhood mainnet chain ID");

const account = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY"));
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const factory = getAddress(required("FACTORY_ADDRESS"));
const expectedAdapter = getAddress(required("GRADUATION_ADAPTER_ADDRESS"));
const expectedHook = getAddress(required("SQUEEZ_HOOK_ADDRESS"));
const expectedVault = getAddress(required("FEE_VAULT_ADDRESS"));
const factoryAbi = [
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchConfigs", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
    { type: "uint32" }, { type: "uint16" }, { type: "uint32" }, { type: "uint256" },
  ] },
  { type: "function", name: "graduationAdapter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "feeVault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "tickerLockSeconds", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
];
const vaultAbi = [{ type: "function", name: "hook", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const [chainId, balance, head, configId, adapter, vault, tickerLockSeconds] = await Promise.all([
  client.getChainId(), client.getBalance({ address: account.address }), client.getBlockNumber(),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeConfigId" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "graduationAdapter" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "feeVault" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "tickerLockSeconds" }),
]);
if (chainId !== 4663) throw new Error("RPC chain ID mismatch");
const config = await client.readContract({ address: factory, abi: factoryAbi, functionName: "launchConfigs", args: [configId] });
const hook = await client.readContract({ address: expectedVault, abi: vaultAbi, functionName: "hook" });

const database = new pg.Pool({ connectionString: required("DATABASE_URL"), max: 1, connectionTimeoutMillis: 10_000 });
let checkpoint;
try {
  const result = await database.query(`select
      substring(latest_checkpoint from 27 for 16)::bigint as "blockNumber",
      (select (value->>'heartbeat_at')::bigint / 1000 from "robinhood_mainnet"._ponder_meta
        where key = 'app' limit 1) as "heartbeatAt"
    from "robinhood_mainnet"._ponder_checkpoint where chain_id = 4663 limit 1`);
  checkpoint = result.rows[0];
} finally {
  await database.end();
}
const checkpointBlock = checkpoint ? BigInt(checkpoint.blockNumber) : null;
const heartbeatAt = checkpoint?.heartbeatAt === null || checkpoint?.heartbeatAt === undefined
  ? null : Number(checkpoint.heartbeatAt);
const lagBlocks = checkpointBlock === null ? null : Number(head - checkpointBlock);
const heartbeatAgeSeconds = heartbeatAt === null ? null : Math.max(0, Math.floor(Date.now() / 1_000) - heartbeatAt);

const graduationThreshold = config[0];
const launchFee = config[7];
const curveSmokeBuy = parseEther("0.001");
const v4SmokeBuy = parseEther("0.001");
const gasReserve = parseEther("0.02");
const capitalHardCap = graduationThreshold + launchFee + curveSmokeBuy + v4SmokeBuy + gasReserve;
const blockers = [
  ...(getAddress(adapter) !== expectedAdapter ? ["graduation-adapter-mismatch"] : []),
  ...(getAddress(vault) !== expectedVault ? ["fee-vault-mismatch"] : []),
  ...(getAddress(hook) !== expectedHook ? ["hook-mismatch"] : []),
  ...(Number(tickerLockSeconds) !== 300 ? ["ticker-lock-mismatch"] : []),
  ...(balance < capitalHardCap ? ["insufficient-canary-balance"] : []),
  ...(lagBlocks === null || lagBlocks > 2_000 ? ["indexer-lag"] : []),
  ...(heartbeatAgeSeconds === null || heartbeatAgeSeconds > 300 ? ["indexer-heartbeat-stale"] : []),
  "public-write-disabled",
  "explicit-transaction-approval-required",
];
const plan = {
  prepared: true,
  broadcastCapable: false,
  eligibleToRequestTransactionApproval: blockers.length === 2,
  target: "robinhood:mainnet",
  chainId,
  wallet: account.address,
  walletBalanceWei: balance.toString(),
  walletBalanceNative: formatEther(balance),
  contracts: { factory, feeVault: getAddress(vault), hook: getAddress(hook), graduationAdapter: getAddress(adapter) },
  economics: {
    configId: configId.toString(),
    graduationThresholdWei: graduationThreshold.toString(),
    launchFeeWei: launchFee.toString(),
    tickerLockSeconds: Number(tickerLockSeconds),
  },
  capitalPolicy: {
    curveSmokeBuyWei: curveSmokeBuy.toString(),
    v4SmokeBuyWei: v4SmokeBuy.toString(),
    gasReserveWei: gasReserve.toString(),
    hardCapWei: capitalHardCap.toString(),
    hardCapNative: formatEther(capitalHardCap),
  },
  indexer: { head: head.toString(), checkpoint: checkpointBlock?.toString() ?? null, lagBlocks, heartbeatAgeSeconds },
  lifecycle: [
    "launch", "curve-buy", "curve-sell", "closing-buy", "graduation", "liquidity-lock",
    "v4-buy", "v4-sell", "fee-vault-delta", "indexer-reconciliation",
  ],
  blockers,
};
console.log(JSON.stringify(plan, null, 2));
if (!plan.eligibleToRequestTransactionApproval) process.exitCode = 2;
