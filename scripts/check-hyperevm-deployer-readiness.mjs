import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const rpc = process.env.SQUEEZ_RPC?.trim();
const key = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const configuredAddress = process.env.DEPLOYER_ADDRESS?.trim();
if (!rpc || (!key && !configuredAddress)) throw new Error("SQUEEZ_RPC and deployer identity are required");
const deployer = key ? privateKeyToAccount(key).address : configuredAddress;
const client = createPublicClient({ transport: http(rpc, { timeout: 12_000, retryCount: 1 }) });
const manifest = JSON.parse(readFileSync(resolve("packages/contracts/deployments/hyperevm/mainnet-predeploy.json"), "utf8"));
const [chainId, balance, usingBigBlocks, bigBlockGasPriceHex] = await Promise.all([
  client.getChainId(),
  client.getBalance({ address: deployer }),
  client.request({ method: "eth_usingBigBlocks", params: [deployer] }),
  client.request({ method: "eth_bigBlockGasPrice", params: [] }),
]);
const bigBlockGasPrice = BigInt(bigBlockGasPriceHex);
const totalGasLimit = BigInt(manifest.simulation.totalGasLimit);
const estimatedCost = totalGasLimit * bigBlockGasPrice;
const recommendedBalance = estimatedCost * 3n;
const result = {
  target: "hyperevm:mainnet",
  chainId,
  deployer,
  usingBigBlocks: Boolean(usingBigBlocks),
  balanceWei: balance.toString(),
  balanceHype: formatEther(balance),
  bigBlockGasPriceWei: bigBlockGasPrice.toString(),
  estimatedCostWei: estimatedCost.toString(),
  recommendedBalanceWei: recommendedBalance.toString(),
  balanceReady: balance >= recommendedBalance,
  manifestTransactionCount: manifest.simulation.transactionCount,
  readyForApprovedBroadcast: chainId === 999 && Boolean(usingBigBlocks) && balance >= recommendedBalance,
};
console.log(JSON.stringify(result, null, 2));
if (!result.readyForApprovedBroadcast) process.exitCode = 2;
