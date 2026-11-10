import { createPublicClient, formatEther, http, isAddress } from "viem";

const address = process.env.ADDRESS_TO_CHECK?.trim();
const rpc = process.env.SQUEEZ_RPC?.trim();
if (!address || !isAddress(address) || !rpc) throw new Error("ADDRESS_TO_CHECK and SQUEEZ_RPC are required");
const client = createPublicClient({ transport: http(rpc) });
const balance = await client.getBalance({ address });
console.log(JSON.stringify({ address, balanceWei: balance.toString(), balanceNative: formatEther(balance) }, null, 2));
