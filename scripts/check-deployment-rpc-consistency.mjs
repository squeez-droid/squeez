import { createPublicClient, http } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const addresses = {
  factory: required("FACTORY_ADDRESS"),
  quoteRegistry: required("QUOTE_REGISTRY_ADDRESS"),
  protectionPolicyRegistry: required("PROTECTION_POLICY_REGISTRY_ADDRESS"),
  identityRegistry: required("IDENTITY_REGISTRY_ADDRESS"),
  feeVault: required("FEE_VAULT_ADDRESS"),
  curveBeacon: required("CURVE_BEACON_ADDRESS"),
};
const endpoints = {
  primary: required("SQUEEZ_RPC"),
  fallback: required("SQUEEZ_RPC_FALLBACK"),
};
const results = {};
for (const [name, endpoint] of Object.entries(endpoints)) {
  const client = createPublicClient({ transport: http(endpoint) });
  const [chainId, blockNumber, codes] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    Promise.all(Object.entries(addresses).map(async ([label, address]) => {
      const code = await client.getCode({ address });
      return [label, Boolean(code && code !== "0x")];
    })),
  ]);
  results[name] = { chainId, blockNumber: blockNumber.toString(), bytecode: Object.fromEntries(codes) };
}
console.log(JSON.stringify(results, null, 2));
if (Object.values(results).some((result) => result.chainId !== Number(required("SQUEEZ_CHAIN_ID"))
  || Object.values(result.bytecode).some((present) => !present))) process.exitCode = 2;
