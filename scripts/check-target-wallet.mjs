import { createPublicClient, formatEther, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const chainId = Number(required("SQUEEZ_CHAIN_ID"));
const rpc = required("SQUEEZ_RPC");
const privateKey = required("DEPLOYER_PRIVATE_KEY");
const admin = required("ADMIN_MULTISIG");
const treasury = required("TREASURY");
if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error("DEPLOYER_PRIVATE_KEY is invalid");
if (!isAddress(admin) || !isAddress(treasury)) throw new Error("ADMIN_MULTISIG or TREASURY is invalid");

const account = privateKeyToAccount(privateKey);
const client = createPublicClient({ transport: http(rpc) });
const [liveChainId, balance] = await Promise.all([client.getChainId(), client.getBalance({ address: account.address })]);
if (liveChainId !== chainId) throw new Error(`RPC chain ${liveChainId} does not match ${chainId}`);

const masked = `${account.address.slice(0, 6)}…${account.address.slice(-4)}`;
console.log(`Target wallet ${masked}: chain ${chainId}, balance ${formatEther(balance)} native.`);
console.log(`Admin configured: ${admin.toLowerCase() === account.address.toLowerCase() ? "deployer" : "separate address"}.`);
console.log(`Treasury configured: ${treasury.toLowerCase() === account.address.toLowerCase() ? "deployer" : "separate address"}.`);
