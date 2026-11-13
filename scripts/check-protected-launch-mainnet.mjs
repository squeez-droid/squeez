#!/usr/bin/env node

import { createPublicClient, getAddress, http, zeroAddress } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const chain = required("SQUEEZ_CHAIN");
const expectedChainIds = { elysium: 99901, hyperevm: 999, robinhood: 4663 };
if (required("SQUEEZ_NETWORK") !== "mainnet" || Number(required("SQUEEZ_CHAIN_ID")) !== expectedChainIds[chain]) {
  throw new Error("Target must be a supported mainnet");
}
const factory = getAddress(required("FACTORY_ADDRESS"));
const policies = getAddress(required("PROTECTION_POLICY_REGISTRY_ADDRESS"));
const identities = getAddress(required("IDENTITY_REGISTRY_ADDRESS"));
const factoryAbi = [
  { type: "function", name: "protectionPolicyRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "activeProtectionPolicyId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "identityRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "tickerLockSeconds", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
];
const identityAbi = [{ type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const policyAbi = [{ type: "function", name: "getPolicy", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{
  type: "tuple", components: [
    { name: "familyId", type: "bytes32" }, { name: "policyHash", type: "bytes32" }, { name: "version", type: "uint32" },
    { name: "protectionWindowSeconds", type: "uint32" }, { name: "initialFeeBps", type: "uint16" },
    { name: "maxBuyBpsPerTransaction", type: "uint16" }, { name: "maxBuyBpsPerAddress", type: "uint16" },
    { name: "enabled", type: "bool" },
  ],
}] }];
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const [activePolicies, activePolicyId, activeIdentities, tickerLockSeconds, identityFactory] = await Promise.all([
  client.readContract({ address: factory, abi: factoryAbi, functionName: "protectionPolicyRegistry" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeProtectionPolicyId" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "identityRegistry" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "tickerLockSeconds" }),
  client.readContract({ address: identities, abi: identityAbi, functionName: "factory" }),
]);
let policy = null;
if (activePolicyId > 0n && getAddress(activePolicies) !== zeroAddress) {
  policy = await client.readContract({ address: policies, abi: policyAbi, functionName: "getPolicy", args: [activePolicyId] });
}
const checks = {
  policyRegistry: getAddress(activePolicies) === policies,
  policyId: activePolicyId > 0n,
  policyEnabled: Boolean(policy?.enabled),
  protectionWindowSeconds: Number(policy?.protectionWindowSeconds ?? 0) === Number(required("SNIPER_TAX_DECAY_SECONDS")),
  initialFeeBps: Number(policy?.initialFeeBps ?? 0) === Number(required("SNIPER_TAX_START_BPS")),
  maxBuyBpsPerTransaction: Number(policy?.maxBuyBpsPerTransaction ?? 0) === Number(required("MAX_BUY_BPS_PER_TRANSACTION")),
  maxBuyBpsPerAddress: Number(policy?.maxBuyBpsPerAddress ?? 0) === Number(required("MAX_WALLET_BPS")),
  identityRegistry: getAddress(activeIdentities) === identities,
  identityFactory: getAddress(identityFactory) === factory,
  tickerLockSeconds: Number(tickerLockSeconds) === Number(required("TICKER_LOCK_SECONDS")),
};
const ready = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ready, factory, policies, identities, activePolicyId: activePolicyId.toString(), checks }, null, 2));
if (!ready) process.exitCode = 2;
