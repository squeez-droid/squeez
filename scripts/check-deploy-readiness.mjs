import { createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount as accountFromKey } from "viem/accounts";

const required = [
  "ELYSIUM_RPC", "ELYSIUM_CHAIN_ID", "DEPLOYER_PRIVATE_KEY", "ADMIN_MULTISIG", "TREASURY",
  "GRADUATION_THRESHOLD_HYPE", "SNIPER_TAX_START_BPS", "SNIPER_TAX_DECAY_SECONDS",
  "MAX_WALLET_BPS", "MAX_WALLET_WINDOW_SECONDS", "LAUNCH_FEE_HYPE",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing deployment variables: ${missing.join(", ")}`);
if (!isAddress(process.env.ADMIN_MULTISIG)) throw new Error("ADMIN_MULTISIG is invalid");
if (!isAddress(process.env.TREASURY)) throw new Error("TREASURY is invalid");

const key = process.env.DEPLOYER_PRIVATE_KEY;
const account = accountFromKey(key);
const client = createPublicClient({ transport: http(process.env.ELYSIUM_RPC) });
const [chainId, balance] = await Promise.all([client.getChainId(), client.getBalance({ address: account.address })]);
const expectedChainId = Number(process.env.ELYSIUM_CHAIN_ID);
if (chainId !== expectedChainId) throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${chainId}`);

const uint = (name) => {
  const value = process.env[name];
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer`);
  return BigInt(value);
};
const threshold = uint("GRADUATION_THRESHOLD_HYPE");
if (!threshold) throw new Error("GRADUATION_THRESHOLD_HYPE must be positive");
if (uint("SNIPER_TAX_START_BPS") > 10_000n) throw new Error("SNIPER_TAX_START_BPS exceeds 10000");
if (uint("MAX_WALLET_BPS") > 10_000n) throw new Error("MAX_WALLET_BPS exceeds 10000");
if (!uint("SNIPER_TAX_DECAY_SECONDS")) throw new Error("SNIPER_TAX_DECAY_SECONDS must be positive");
if (!uint("MAX_WALLET_WINDOW_SECONDS")) throw new Error("MAX_WALLET_WINDOW_SECONDS must be positive");

console.log(JSON.stringify({ ready: balance > 0n, chainId, deployer: account.address,
  deployerBalanceWei: balance.toString(), adminValid: true, treasuryValid: true,
  derivedVirtualHypeReserveWei: (threshold * 2n / 5n).toString(),
  derivedVirtualTokenReserveWei: "1000000000000000000000000000" }, null, 2));
if (balance === 0n) process.exitCode = 2;
