import { createPublicClient, http, zeroAddress } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const contracts = {
  factory: required("FACTORY_ADDRESS"),
  quoteRegistry: required("QUOTE_REGISTRY_ADDRESS"),
  protectionPolicyRegistry: required("PROTECTION_POLICY_REGISTRY_ADDRESS"),
  identityRegistry: required("IDENTITY_REGISTRY_ADDRESS"),
  feeVault: required("FEE_VAULT_ADDRESS"),
};
const safe = required("ADMIN_MULTISIG").toLowerCase();
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const abi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pendingOwner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const state = {};
for (const [name, address] of Object.entries(contracts)) {
  const [owner, pendingOwner] = await Promise.all([
    client.readContract({ address, abi, functionName: "owner" }),
    client.readContract({ address, abi, functionName: "pendingOwner" }),
  ]);
  state[name] = { address, owner, pendingOwner };
}
const beaconAddress = required("CURVE_BEACON_ADDRESS");
const beaconOwner = await client.readContract({
  address: beaconAddress,
  abi: [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
  functionName: "owner",
});
const uupsAccepted = Object.values(state).every(({ owner, pendingOwner }) =>
  owner.toLowerCase() === safe && pendingOwner.toLowerCase() === zeroAddress);
const beaconAccepted = beaconOwner.toLowerCase() === safe;
const migrationComplete = uupsAccepted && beaconAccepted;
console.log(JSON.stringify({ migrationComplete, uupsAccepted, beaconAccepted, safe, state,
  curveBeacon: { address: beaconAddress, owner: beaconOwner } }, null, 2));
if (!migrationComplete) process.exitCode = 2;
