import { createPublicClient, http } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
const factory = required("FACTORY_ADDRESS");
const factoryAbi = [
  { type: "function", name: "activeConfigId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "activeProtectionPolicyId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protectionPolicyRegistry", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "launchConfigs", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" },
    { type: "uint32" }, { type: "uint16" }, { type: "uint32" }, { type: "uint256" },
  ] },
];
const policyAbi = [{
  type: "function", name: "getPolicy", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{
    type: "tuple", components: [
      { name: "familyId", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
      { name: "version", type: "uint32" }, { name: "protectionWindowSeconds", type: "uint32" },
      { name: "initialFeeBps", type: "uint16" }, { name: "maxBuyBpsPerTransaction", type: "uint16" },
      { name: "maxBuyBpsPerAddress", type: "uint16" }, { name: "enabled", type: "bool" },
    ],
  }],
}];
const [configId, policyId, registry] = await Promise.all([
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeConfigId" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "activeProtectionPolicyId" }),
  client.readContract({ address: factory, abi: factoryAbi, functionName: "protectionPolicyRegistry" }),
]);
const [config, policy] = await Promise.all([
  client.readContract({ address: factory, abi: factoryAbi, functionName: "launchConfigs", args: [configId] }),
  client.readContract({ address: registry, abi: policyAbi, functionName: "getPolicy", args: [policyId] }),
]);
const result = {
  factory, registry, configId: configId.toString(), policyId: policyId.toString(),
  launchConfig: { sniperTaxStartBps: Number(config[3]), sniperTaxDecaySeconds: Number(config[4]) },
  policy: {
    version: Number(policy.version), initialFeeBps: Number(policy.initialFeeBps),
    protectionWindowSeconds: Number(policy.protectionWindowSeconds), enabled: policy.enabled,
  },
};
console.log(JSON.stringify({ ...result, matches: result.policy.enabled
  && result.policy.initialFeeBps === result.launchConfig.sniperTaxStartBps
  && result.policy.protectionWindowSeconds === result.launchConfig.sniperTaxDecaySeconds }, null, 2));
