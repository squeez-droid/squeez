import { createPublicClient, getAddress, http, isAddress } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const nextAdmin = required("NEXT_ADMIN_MULTISIG");
const currentAdmin = required("ADMIN_MULTISIG");
const treasury = required("TREASURY");
if (![nextAdmin, currentAdmin, treasury].every(isAddress)) throw new Error("admin or treasury address is invalid");
if (nextAdmin.toLowerCase() === currentAdmin.toLowerCase()) throw new Error("next admin equals current admin");

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
if (await client.getChainId() !== Number(required("SQUEEZ_CHAIN_ID"))) throw new Error("RPC chain ID mismatch");
const code = await client.getCode({ address: nextAdmin });
if (!code || code === "0x") throw new Error("NEXT_ADMIN_MULTISIG is not a contract on the selected chain");

const safeAbi = [
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "VERSION", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];
let owners;
let threshold;
let nonce;
let version;
try {
  [owners, threshold, nonce, version] = await Promise.all([
    client.readContract({ address: nextAdmin, abi: safeAbi, functionName: "getOwners" }),
    client.readContract({ address: nextAdmin, abi: safeAbi, functionName: "getThreshold" }),
    client.readContract({ address: nextAdmin, abi: safeAbi, functionName: "nonce" }),
    client.readContract({ address: nextAdmin, abi: safeAbi, functionName: "VERSION" }),
  ]);
} catch {
  throw new Error("NEXT_ADMIN_MULTISIG has bytecode but does not expose the expected Safe interface");
}
const recommended = owners.length >= 3 && threshold >= 2n;
console.log(JSON.stringify({
  ready: recommended,
  address: getAddress(nextAdmin),
  version,
  ownerCount: owners.length,
  threshold: threshold.toString(),
  nonce: nonce.toString(),
  owners: owners.map(getAddress),
  distinctFromCurrentAdmin: nextAdmin.toLowerCase() !== currentAdmin.toLowerCase(),
  distinctFromTreasury: nextAdmin.toLowerCase() !== treasury.toLowerCase(),
  recommendation: recommended ? "meets 2-of-3 minimum" : "use at least 2-of-3 for production",
}, null, 2));
if (!recommended) process.exitCode = 2;
