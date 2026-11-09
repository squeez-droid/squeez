import { createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const key = required("UPGRADE_ADMIN_PRIVATE_KEY");
const expectedAdmin = required("ADMIN_MULTISIG");
if (!isAddress(expectedAdmin)) throw new Error("ADMIN_MULTISIG is invalid");
const account = privateKeyToAccount(key);
if (account.address.toLowerCase() !== expectedAdmin.toLowerCase()) {
  throw new Error("UPGRADE_ADMIN_PRIVATE_KEY does not belong to ADMIN_MULTISIG");
}
const client = createPublicClient({ transport: http(required("ELYSIUM_RPC")) });
const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const [chainId, balance, factoryOwner, beaconOwner] = await Promise.all([
  client.getChainId(),
  client.getBalance({ address: account.address }),
  client.readContract({ address: required("FACTORY_ADDRESS"), abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: required("CURVE_BEACON_ADDRESS"), abi: ownerAbi, functionName: "owner" }),
]);
const expectedChainId = Number(required("ELYSIUM_CHAIN_ID"));
if (chainId !== expectedChainId) throw new Error(`RPC chain mismatch: expected ${expectedChainId}, got ${chainId}`);
if (factoryOwner.toLowerCase() !== expectedAdmin.toLowerCase()) throw new Error("ADMIN_MULTISIG is not Factory owner");
if (beaconOwner.toLowerCase() !== expectedAdmin.toLowerCase()) throw new Error("ADMIN_MULTISIG is not Curve Beacon owner");
if (balance === 0n) throw new Error("upgrade admin has no native token for gas");
console.log(JSON.stringify({ ready: true, chainId, signer: account.address, balanceWei: balance.toString(),
  factoryOwnerMatches: true, beaconOwnerMatches: true }, null, 2));
