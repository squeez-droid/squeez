import { createPublicClient, createWalletClient, http, parseEther, parseEventLogs, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mkdirSync, writeFileSync } from "node:fs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const token = process.env.E2E_TOKEN_ADDRESS ?? "0xC168cA86449Fd24384985Abe58162398eCE980dA";
const router = required("SWAP_ROUTER_ADDRESS");
const quoter = required("V4_QUOTER_ADDRESS");
const hook = required("SQUEEZ_HOOK_ADDRESS");
const vault = required("FEE_VAULT_ADDRESS");
const account = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY"));
const transport = http(required("ELYSIUM_RPC"));
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });
const poolKey = {
  currency0: zeroAddress,
  currency1: token,
  fee: Number(required("V4_LP_FEE_BPS")),
  tickSpacing: Number(required("V4_TICK_SPACING")),
  hooks: hook,
};
const routerAbi = [{
  type: "function", name: "swapExactInput", stateMutability: "payable",
  inputs: [
    { name: "key", type: "tuple", components: [
      { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" },
    ] },
    { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" },
    { name: "minAmountOut", type: "uint128" }, { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" },
  ], outputs: [{ type: "uint256" }],
}, {
  type: "event", name: "PoolSwap", anonymous: false, inputs: [
    { indexed: true, name: "token", type: "address" }, { indexed: true, name: "trader", type: "address" },
    { indexed: false, name: "isBuy", type: "bool" }, { indexed: false, name: "quoteAmount", type: "uint256" },
    { indexed: false, name: "tokenAmount", type: "uint256" },
  ],
}];
const quoterAbi = [{
  type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "poolKey", type: "tuple", components: [
      { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" },
    ] }, { name: "zeroForOne", type: "bool" }, { name: "exactAmount", type: "uint128" },
    { name: "hookData", type: "bytes" },
  ] }], outputs: [{ type: "uint256" }, { type: "uint256" }],
}];
const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
];
const vaultAbi = [
  { type: "function", name: "creatorFeesAccrued", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "treasuryBalance", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "buybackBalance", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
const feeBalances = async () => {
  const [creator, treasury, buyback] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "creatorFeesAccrued", args: [token, zeroAddress] }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "treasuryBalance", args: [zeroAddress] }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "buybackBalance", args: [zeroAddress] }),
  ]);
  return { creator, treasury, buyback };
};
const beforeFees = await feeBalances();
const tokenBefore = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const block = await publicClient.getBlock();
const buyAmount = parseEther("0.001");
const buyQuote = await publicClient.simulateContract({
  account, address: quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
  args: [{ poolKey, zeroForOne: true, exactAmount: buyAmount, hookData: "0x" }],
});
const buyHash = await walletClient.writeContract({
  address: router, abi: routerAbi, functionName: "swapExactInput",
  args: [poolKey, true, buyAmount, buyQuote.result[0] * 99n / 100n, account.address, block.timestamp + 300n], value: buyAmount,
});
const buyReceipt = await publicClient.waitForTransactionReceipt({ hash: buyHash });
if (buyReceipt.status !== "success") throw new Error("v4 buy reverted");
const tokenAfterBuy = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
const boughtTokens = tokenAfterBuy - tokenBefore;
if (boughtTokens <= 0n) throw new Error("v4 buy returned no tokens");

const sellAmount = boughtTokens / 2n;
const approvalHash = await walletClient.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [router, sellAmount] });
const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
if (approvalReceipt.status !== "success") throw new Error("router approval reverted");
const sellBlock = await publicClient.getBlock();
const sellQuote = await publicClient.simulateContract({
  account, address: quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
  args: [{ poolKey, zeroForOne: false, exactAmount: sellAmount, hookData: "0x" }],
});
const sellHash = await walletClient.writeContract({
  address: router, abi: routerAbi, functionName: "swapExactInput",
  args: [poolKey, false, sellAmount, sellQuote.result[0] * 99n / 100n, account.address, sellBlock.timestamp + 300n],
});
const sellReceipt = await publicClient.waitForTransactionReceipt({ hash: sellHash });
if (sellReceipt.status !== "success") throw new Error("v4 sell reverted");
const [buyEvent] = parseEventLogs({ abi: routerAbi, logs: buyReceipt.logs, eventName: "PoolSwap" });
const [sellEvent] = parseEventLogs({ abi: routerAbi, logs: sellReceipt.logs, eventName: "PoolSwap" });
if (!buyEvent || !sellEvent || !buyEvent.args.isBuy || sellEvent.args.isBuy
  || buyEvent.args.trader.toLowerCase() !== account.address.toLowerCase()
  || sellEvent.args.trader.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error("router PoolSwap events are missing or incorrect");
}
const afterFees = await feeBalances();
const feeDelta = {
  creator: afterFees.creator - beforeFees.creator,
  treasury: afterFees.treasury - beforeFees.treasury,
  buyback: afterFees.buyback - beforeFees.buyback,
};
if (feeDelta.creator <= 0n || feeDelta.treasury <= 0n || feeDelta.buyback <= 0n) {
  throw new Error("FeeVault buckets did not increase after v4 swaps");
}
const evidence = {
  token, router, quoter, hook, vault,
  buyQuotedOutput: buyQuote.result[0].toString(), sellQuotedOutput: sellQuote.result[0].toString(),
  boughtTokens: boughtTokens.toString(), soldTokens: sellAmount.toString(),
  buyHash, buyBlock: buyReceipt.blockNumber.toString(), approvalHash,
  sellHash, sellBlock: sellReceipt.blockNumber.toString(),
  indexedEvents: {
    buy: { trader: buyEvent.args.trader, quoteAmount: buyEvent.args.quoteAmount.toString(), tokenAmount: buyEvent.args.tokenAmount.toString() },
    sell: { trader: sellEvent.args.trader, quoteAmount: sellEvent.args.quoteAmount.toString(), tokenAmount: sellEvent.args.tokenAmount.toString() },
  },
  feeDelta: Object.fromEntries(Object.entries(feeDelta).map(([key, value]) => [key, value.toString()])),
};
mkdirSync("docs/evidence/phase-5", { recursive: true });
writeFileSync("docs/evidence/phase-5/testnet-v4-swaps.json", `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
