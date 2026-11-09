import { createPublicClient, createWalletClient, http, parseEventLogs, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mkdirSync, writeFileSync } from "node:fs";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const token = process.env.E2E_TOKEN_ADDRESS ?? "0xC168cA86449Fd24384985Abe58162398eCE980dA";
const vault = required("FEE_VAULT_ADDRESS");
const account = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY"));
const transport = http(required("ELYSIUM_RPC"));
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });
const vaultAbi = [
  { type: "function", name: "curveForToken", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "creatorFeesAccrued", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "claimCreatorFees", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "event", name: "CreatorFeeClaimed", anonymous: false, inputs: [
    { indexed: true, name: "token", type: "address" }, { indexed: true, name: "asset", type: "address" },
    { indexed: true, name: "recipient", type: "address" }, { indexed: false, name: "amount", type: "uint256" },
  ] },
];
const curveAbi = [{ type: "function", name: "feeRecipient", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];

const curve = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "curveForToken", args: [token] });
const feeRecipient = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: "feeRecipient" });
if (feeRecipient.toLowerCase() !== account.address.toLowerCase()) {
  throw new Error(`test wallet is not the token fee recipient (${feeRecipient})`);
}
const claimableBefore = await publicClient.readContract({
  address: vault, abi: vaultAbi, functionName: "creatorFeesAccrued", args: [token, zeroAddress],
});
if (claimableBefore <= 0n) throw new Error("token has no claimable native creator fees");
const balanceBefore = await publicClient.getBalance({ address: account.address });
const hash = await walletClient.writeContract({
  account, address: vault, abi: vaultAbi, functionName: "claimCreatorFees", args: [token, zeroAddress],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("creator claim reverted");
const events = parseEventLogs({ abi: vaultAbi, logs: receipt.logs, eventName: "CreatorFeeClaimed" });
const [event] = events;
if (!event || event.args.token.toLowerCase() !== token.toLowerCase()
  || event.args.asset !== zeroAddress || event.args.recipient.toLowerCase() !== account.address.toLowerCase()
  || event.args.amount !== claimableBefore) {
  throw new Error("CreatorFeeClaimed event does not match the claim");
}
const [claimableAfter, balanceAfter] = await Promise.all([
  publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "creatorFeesAccrued", args: [token, zeroAddress] }),
  publicClient.getBalance({ address: account.address }),
]);
if (claimableAfter !== 0n) throw new Error("creator liability was not cleared");
const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
if (balanceAfter + gasCost - balanceBefore !== claimableBefore) throw new Error("recipient balance delta does not reconcile");

const evidence = {
  token, curve, vault, recipient: account.address, asset: zeroAddress,
  claimableBefore: claimableBefore.toString(), claimableAfter: claimableAfter.toString(),
  claimedAmount: event.args.amount.toString(), transactionHash: hash,
  blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(),
  effectiveGasPrice: receipt.effectiveGasPrice.toString(), gasCost: gasCost.toString(),
  recipientBalanceDeltaAfterGas: (balanceAfter + gasCost - balanceBefore).toString(),
};
mkdirSync("docs/evidence/phase-5", { recursive: true });
writeFileSync("docs/evidence/phase-5/testnet-creator-claim.json", `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
