import { createPublicClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const configuredAddress = getAddress(required("SQUEEZ_ATTESTER_ADDRESS"));
const derivedAddress = privateKeyToAccount(required("SQUEEZ_ATTESTER_PRIVATE_KEY")).address;
if (derivedAddress !== configuredAddress) throw new Error("Attester private key does not match its configured address");

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
if (await client.getChainId() !== Number(required("SQUEEZ_CHAIN_ID"))) throw new Error("RPC chain ID mismatch");
const onchainAddress = await client.readContract({
  address: getAddress(required("FACTORY_ADDRESS")),
  abi: [{ type: "function", name: "attester", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
  functionName: "attester",
});
if (onchainAddress !== configuredAddress) throw new Error("Factory attester does not match the backend signer");
console.log("Attester key, configured address, chain, and Factory state all match.");
