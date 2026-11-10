import { createPublicClient, http, isAddress } from "viem";
import { privateKeyToAccount as accountFromKey } from "viem/accounts";

const rpcUrl = process.env.SQUEEZ_RPC || process.env.ELYSIUM_RPC;
const configuredChainId = process.env.SQUEEZ_CHAIN_ID || process.env.ELYSIUM_CHAIN_ID;
const required = [
  "DEPLOYER_PRIVATE_KEY", "ADMIN_MULTISIG", "TREASURY",
  "GRADUATION_THRESHOLD_HYPE", "SNIPER_TAX_START_BPS", "SNIPER_TAX_DECAY_SECONDS",
  "MAX_BUY_BPS_PER_TRANSACTION", "MAX_WALLET_BPS", "MAX_WALLET_WINDOW_SECONDS", "LAUNCH_FEE_HYPE",
];
if (process.env.SQUEEZ_CHAIN === "robinhood") required.push("TICKER_LOCK_SECONDS");
const missing = required.filter((name) => !process.env[name]?.trim());
if (!rpcUrl) missing.unshift("SQUEEZ_RPC");
if (!configuredChainId) missing.unshift("SQUEEZ_CHAIN_ID");
if (missing.length) throw new Error(`Missing deployment variables: ${missing.join(", ")}`);
if (!isAddress(process.env.ADMIN_MULTISIG)) throw new Error("ADMIN_MULTISIG is invalid");
if (!isAddress(process.env.TREASURY)) throw new Error("TREASURY is invalid");
if (process.env.SQUEEZ_NETWORK === "mainnet") {
  if (process.env.SQUEEZ_CHAIN !== "robinhood") throw new Error("Current mainnet release target must be robinhood");
  if (!rpcUrl.startsWith("https://")) throw new Error("Mainnet RPC must use HTTPS");
  if (new URL(rpcUrl).hostname === "rpc.mainnet.chain.robinhood.com") {
    throw new Error("Robinhood public RPC is not production-grade; configure a dedicated archive-capable provider RPC");
  }
  const fallbackRpc = process.env.SQUEEZ_RPC_FALLBACK?.trim();
  if (!fallbackRpc) throw new Error("Robinhood mainnet requires SQUEEZ_RPC_FALLBACK from an independent provider");
  if (!fallbackRpc.startsWith("https://")) throw new Error("Mainnet fallback RPC must use HTTPS");
  if (new URL(fallbackRpc).hostname === new URL(rpcUrl).hostname) {
    throw new Error("Mainnet primary and fallback RPC must use independent provider hosts");
  }
}

const key = process.env.DEPLOYER_PRIVATE_KEY;
const account = accountFromKey(key);
const client = createPublicClient({ transport: http(rpcUrl) });
const [chainId, balance] = await Promise.all([client.getChainId(), client.getBalance({ address: account.address })]);
const expectedChainId = Number(configuredChainId);
if (chainId !== expectedChainId) throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${chainId}`);

const uint = (name) => {
  const value = process.env[name];
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer`);
  return BigInt(value);
};
const threshold = uint("GRADUATION_THRESHOLD_HYPE");
if (!threshold) throw new Error("GRADUATION_THRESHOLD_HYPE must be positive");
if (uint("SNIPER_TAX_START_BPS") > 10_000n) throw new Error("SNIPER_TAX_START_BPS exceeds 10000");
if (uint("MAX_BUY_BPS_PER_TRANSACTION") > 10_000n) throw new Error("MAX_BUY_BPS_PER_TRANSACTION exceeds 10000");
if (uint("MAX_WALLET_BPS") > 10_000n) throw new Error("MAX_WALLET_BPS exceeds 10000");
if (!uint("SNIPER_TAX_DECAY_SECONDS")) throw new Error("SNIPER_TAX_DECAY_SECONDS must be positive");
if (!uint("MAX_WALLET_WINDOW_SECONDS")) throw new Error("MAX_WALLET_WINDOW_SECONDS must be positive");
if (process.env.SQUEEZ_CHAIN === "robinhood" && uint("TICKER_LOCK_SECONDS") !== 300n) {
  throw new Error("Robinhood ticker lock must be 300 seconds for this release");
}

console.log(JSON.stringify({ ready: balance > 0n, chainId, deployer: account.address,
  deployerBalanceWei: balance.toString(), adminValid: true, treasuryValid: true,
  tickerLockSeconds: process.env.TICKER_LOCK_SECONDS ?? null,
  derivedVirtualHypeReserveWei: (threshold * 2n / 5n).toString(),
  derivedVirtualTokenReserveWei: "1000000000000000000000000000" }, null, 2));
if (balance === 0n) process.exitCode = 2;
