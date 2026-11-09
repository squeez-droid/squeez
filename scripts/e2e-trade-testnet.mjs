import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const token = process.env.E2E_TOKEN_ADDRESS ?? "0x122785a32cDaAE6cccE73b9Fe5fAbA5eEa2f1371";
const curve = process.env.E2E_CURVE_ADDRESS ?? "0x7D09E2290C05168E1220e07Adfe46975d89e71B2";
const account = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY"));
const transport = http(required("ELYSIUM_RPC"));
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });
const curveAbi = [
  { type: "function", name: "quoteBuy", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "buy", stateMutability: "payable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "quoteSell", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
];
const tokenAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
const amountIn = parseEther("0.01");
const quote = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: "quoteBuy", args: [amountIn] });
const block = await publicClient.getBlock();
const deadline = block.timestamp + 300n;
const buyHash = await walletClient.writeContract({ address: curve, abi: curveAbi, functionName: "buy",
  args: [quote[0] * 99n / 100n, deadline], value: amountIn });
const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });
if (buyReceipt.status !== "success") throw new Error("Buy reverted");
const tokens = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [account.address] });
const approveHash = await walletClient.writeContract({ address: token, abi: tokenAbi, functionName: "approve", args: [curve, tokens] });
const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
if (approveReceipt.status !== "success") throw new Error("Approve reverted");
const sellQuote = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: "quoteSell", args: [tokens] });
const sellHash = await walletClient.writeContract({ address: curve, abi: curveAbi, functionName: "sell",
  args: [tokens, sellQuote[0] * 99n / 100n, deadline] });
const sellReceipt = await publicClient.waitForTransactionReceipt({ hash: sellHash });
if (sellReceipt.status !== "success") throw new Error("Sell reverted");
console.log(JSON.stringify({ token, curve, tokens: tokens.toString(), buyHash, approveHash, sellHash,
  buyBlock: buyReceipt.blockNumber.toString(), sellBlock: sellReceipt.blockNumber.toString() }, null, 2));
