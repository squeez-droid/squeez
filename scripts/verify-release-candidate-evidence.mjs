import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const hash = /^0x[0-9a-f]{64}$/i;
const address = /^0x[0-9a-f]{40}$/i;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

const [graduation, swaps, claim] = await Promise.all([
  read("docs/evidence/phase-5/testnet-graduation.json"),
  read("docs/evidence/phase-5/testnet-v4-swaps.json"),
  read("docs/evidence/phase-5/testnet-creator-claim.json"),
]);

requireValue(address.test(graduation.token), "Graduation token address is invalid");
requireValue(graduation.token.toLowerCase() === swaps.token.toLowerCase(), "Graduation and swap evidence use different tokens");
requireValue(swaps.token.toLowerCase() === claim.token.toLowerCase(), "Swap and claim evidence use different tokens");
for (const [label, value] of Object.entries({
  closingBuy: graduation.buyHash,
  graduation: graduation.graduationHash,
  poolBuy: swaps.buyHash,
  poolSell: swaps.sellHash,
  creatorClaim: claim.transactionHash,
})) requireValue(hash.test(value), `${label} transaction hash is invalid`);
requireValue(BigInt(swaps.feeDelta.creator) > 0n, "Creator fee did not increase after v4 swaps");
requireValue(BigInt(swaps.feeDelta.treasury) > 0n, "Treasury fee did not increase after v4 swaps");
requireValue(BigInt(swaps.feeDelta.buyback) > 0n, "Buyback bucket did not increase after v4 swaps");
requireValue(BigInt(claim.claimableBefore) > 0n && BigInt(claim.claimableAfter) === 0n, "Creator claim did not clear its liability");

console.log(JSON.stringify({
  ok: true,
  token: graduation.token,
  lifecycle: ["graduation", "v4-buy", "v4-sell", "fee-accrual", "creator-claim"],
  browserWalletEvidence: "pending",
}, null, 2));
