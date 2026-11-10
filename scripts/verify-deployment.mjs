import { createPublicClient, http, isAddress, zeroAddress } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const addresses = {
  factory: required("FACTORY_ADDRESS"),
  registry: required("QUOTE_REGISTRY_ADDRESS"),
  protectionPolicyRegistry: required("PROTECTION_POLICY_REGISTRY_ADDRESS"),
  identityRegistry: required("IDENTITY_REGISTRY_ADDRESS"),
  vault: required("FEE_VAULT_ADDRESS"),
  factoryImplementation: required("FACTORY_IMPLEMENTATION_ADDRESS"),
  registryImplementation: required("QUOTE_REGISTRY_IMPLEMENTATION_ADDRESS"),
  protectionPolicyRegistryImplementation: required("PROTECTION_POLICY_REGISTRY_IMPLEMENTATION_ADDRESS"),
  identityRegistryImplementation: required("IDENTITY_REGISTRY_IMPLEMENTATION_ADDRESS"),
  vaultImplementation: required("FEE_VAULT_IMPLEMENTATION_ADDRESS"),
  curveBeacon: required("CURVE_BEACON_ADDRESS"),
  curveImplementation: required("CURVE_IMPLEMENTATION_ADDRESS"),
};
for (const [name, value] of Object.entries(addresses)) if (!isAddress(value)) throw new Error(`${name} address is invalid`);
const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (await client.getChainId() !== chainId) throw new Error("RPC chain ID mismatch");

const ownerAbi = [{ type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const factoryAbi = [
  { type: "function", name: "quoteRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "feeVault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "curveBeacon", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchConfigs", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
    { type: "uint32" }, { type: "uint16" }, { type: "uint32" }, { type: "uint256" },
  ] },
];
const registryAbi = [{ type: "function", name: "isActive", stateMutability: "view",
  inputs: [{ type: "address" }], outputs: [{ type: "bool" }] }];
const beaconAbi = [
  { type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const proxyImplementation = async (address) => {
  const value = await client.getStorageAt({ address, slot: implementationSlot });
  return value ? `0x${value.slice(-40)}`.toLowerCase() : zeroAddress;
};
const codes = await Promise.all(Object.values(addresses).map((address) => client.getCode({ address })));
if (codes.some((code) => !code || code === "0x")) throw new Error("One or more deployment addresses have no bytecode");
const [factoryOwner, registryOwner, protectionPolicyRegistryOwner, identityRegistryOwner, vaultOwner,
  registry, vault, treasury, curveBeacon, activeConfigId, hypeActive, factoryImplementation,
  registryImplementation, protectionPolicyRegistryImplementation, identityRegistryImplementation,
  vaultImplementation, curveImplementation, curveBeaconOwner] = await Promise.all([
  client.readContract({ address: addresses.factory, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: addresses.registry, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: addresses.protectionPolicyRegistry, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: addresses.identityRegistry, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: addresses.vault, abi: ownerAbi, functionName: "owner" }),
  client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "quoteRegistry" }),
  client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "feeVault" }),
  client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "treasury" }),
  client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "curveBeacon" }),
  client.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "activeConfigId" }),
  client.readContract({ address: addresses.registry, abi: registryAbi, functionName: "isActive", args: [zeroAddress] }),
  proxyImplementation(addresses.factory),
  proxyImplementation(addresses.registry),
  proxyImplementation(addresses.protectionPolicyRegistry),
  proxyImplementation(addresses.identityRegistry),
  proxyImplementation(addresses.vault),
  client.readContract({ address: addresses.curveBeacon, abi: beaconAbi, functionName: "implementation" }),
  client.readContract({ address: addresses.curveBeacon, abi: beaconAbi, functionName: "owner" }),
]);
const config = await client.readContract({ address: addresses.factory, abi: factoryAbi,
  functionName: "launchConfigs", args: [activeConfigId] });
const expectedOwner = required("ADMIN_MULTISIG").toLowerCase();
const checks = {
  bytecode: true,
  owners: [factoryOwner, registryOwner, protectionPolicyRegistryOwner, identityRegistryOwner, vaultOwner]
    .every((owner) => owner.toLowerCase() === expectedOwner),
  factoryRegistry: registry.toLowerCase() === addresses.registry.toLowerCase(),
  factoryVault: vault.toLowerCase() === addresses.vault.toLowerCase(),
  treasury: treasury.toLowerCase() === required("TREASURY").toLowerCase(),
  factoryImplementation: factoryImplementation === addresses.factoryImplementation.toLowerCase(),
  registryImplementation: registryImplementation === addresses.registryImplementation.toLowerCase(),
  protectionPolicyRegistryImplementation:
    protectionPolicyRegistryImplementation === addresses.protectionPolicyRegistryImplementation.toLowerCase(),
  identityRegistryImplementation:
    identityRegistryImplementation === addresses.identityRegistryImplementation.toLowerCase(),
  vaultImplementation: vaultImplementation === addresses.vaultImplementation.toLowerCase(),
  curveBeacon: curveBeacon.toLowerCase() === addresses.curveBeacon.toLowerCase(),
  curveImplementation: curveImplementation.toLowerCase() === addresses.curveImplementation.toLowerCase(),
  curveBeaconOwner: curveBeaconOwner.toLowerCase() === expectedOwner,
  nativeHypeActive: hypeActive,
  config: {
    threshold: config[0].toString(), virtualHype: config[1].toString(), virtualTokens: config[2].toString(),
    sniperStartBps: Number(config[3]), sniperDecaySeconds: Number(config[4]), maxWalletBps: Number(config[5]),
    maxWalletWindowSeconds: Number(config[6]), launchFee: config[7].toString(),
  },
};
console.log(JSON.stringify({ chainId, addresses, checks }, null, 2));
if (Object.entries(checks).some(([key, value]) => key !== "config" && value !== true)) process.exitCode = 2;
