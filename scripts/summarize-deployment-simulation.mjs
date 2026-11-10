import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chainId = Number(process.env.SQUEEZ_CHAIN_ID);
const rpc = process.env.SQUEEZ_RPC?.trim();
const key = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpc || !key || !Number.isSafeInteger(chainId)) throw new Error("RPC, chain ID, and deployer key are required");
const path = resolve(`packages/contracts/broadcast/Deploy.s.sol/${chainId}/dry-run/run-latest.json`);
const run = JSON.parse(readFileSync(path, "utf8"));
const transactions = run.transactions ?? [];
const totalGasLimit = transactions.reduce((sum, entry) => sum + BigInt(entry.transaction?.gas ?? 0), 0n);
if (!totalGasLimit) throw new Error("Dry-run artifact contains no deployment gas estimates");
const account = privateKeyToAccount(key);
const client = createPublicClient({ transport: http(rpc) });
const [gasPrice, balance, remoteChainId] = await Promise.all([
  client.getGasPrice(), client.getBalance({ address: account.address }), client.getChainId(),
]);
if (remoteChainId !== chainId) throw new Error("RPC chain ID mismatch");
const estimatedCostWei = totalGasLimit * gasPrice;
const recommendedBalanceWei = estimatedCostWei * 3n;
console.log(JSON.stringify({
  ready: balance >= recommendedBalanceWei,
  chainId,
  transactionCount: transactions.length,
  totalGasLimit: totalGasLimit.toString(),
  gasPriceWei: gasPrice.toString(),
  estimatedCostWei: estimatedCostWei.toString(),
  recommendedBalanceWei: recommendedBalanceWei.toString(),
  deployerBalanceWei: balance.toString(),
  safetyMultiplier: 3,
}, null, 2));
if (balance < recommendedBalanceWei) process.exitCode = 2;
