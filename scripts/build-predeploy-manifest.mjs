import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { keccak256 } from "viem";

const chain = process.env.SQUEEZ_CHAIN?.trim();
const network = process.env.SQUEEZ_NETWORK?.trim();
const chainId = Number(process.env.SQUEEZ_CHAIN_ID);
if (!chain || !["testnet", "mainnet"].includes(network) || !Number.isSafeInteger(chainId)) {
  throw new Error("SQUEEZ_CHAIN, SQUEEZ_NETWORK, and SQUEEZ_CHAIN_ID are required");
}

const artifactPath = resolve(`packages/contracts/broadcast/Deploy.s.sol/${chainId}/dry-run/run-latest.json`);
if (!existsSync(artifactPath)) throw new Error(`Missing dry-run artifact: ${artifactPath}`);
const run = JSON.parse(readFileSync(artifactPath, "utf8"));
const transactions = (run.transactions ?? []).map((entry, index) => ({
  index,
  transactionType: entry.transactionType ?? null,
  contractName: entry.contractName ?? null,
  predictedAddress: entry.contractAddress ?? null,
  function: entry.function ?? null,
  from: entry.transaction?.from ?? null,
  to: entry.transaction?.to ?? null,
  nonce: entry.transaction?.nonce === undefined ? null : BigInt(entry.transaction.nonce).toString(),
  valueWei: entry.transaction?.value === undefined ? "0" : BigInt(entry.transaction.value).toString(),
  gasLimit: entry.transaction?.gas === undefined ? "0" : BigInt(entry.transaction.gas).toString(),
  inputKeccak256: entry.transaction?.input ? keccak256(entry.transaction.input) : null,
  additionalContracts: entry.additionalContracts ?? [],
}));
if (!transactions.length) throw new Error("Dry-run artifact contains no transactions");

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sourceCommit = run.commit ?? git(["rev-parse", "--short", "HEAD"]);
const dirty = git(["status", "--porcelain"]).length > 0;
const totalGasLimit = transactions.reduce((sum, tx) => sum + BigInt(tx.gasLimit), 0n);
const fastBlockGasLimit = 2_000_000n;
const oversizedTransactions = transactions
  .filter((tx) => BigInt(tx.gasLimit) > fastBlockGasLimit)
  .map((tx) => ({ index: tx.index, contractName: tx.contractName, gasLimit: tx.gasLimit }));
const role = (name) => process.env[name]?.trim() || null;
const manifest = {
  schemaVersion: 1,
  kind: "predeploy-simulation",
  chain,
  network,
  chainId,
  generatedAt: new Date().toISOString(),
  source: {
    commit: sourceCommit,
    dirty,
    compiler: "solc-0.8.26",
    evmVersion: "cancun",
    optimizer: { enabled: true, runs: 1, viaIR: true },
    script: "packages/contracts/script/Deploy.s.sol",
    artifact: `packages/contracts/broadcast/Deploy.s.sol/${chainId}/dry-run/run-latest.json`,
  },
  governance: {
    deployer: transactions[0]?.from ?? role("DEPLOYER_ADDRESS"),
    adminMultisig: role("ADMIN_MULTISIG"),
    treasury: role("TREASURY"),
    upgradeAdmin: role("UPGRADE_ADMIN_ADDRESS") ?? role("ADMIN_MULTISIG"),
  },
  launchConfig: {
    graduationThresholdNative: role("GRADUATION_THRESHOLD_HYPE"),
    launchFeeNative: role("LAUNCH_FEE_HYPE"),
    sniperTaxStartBps: role("SNIPER_TAX_START_BPS"),
    sniperTaxDecaySeconds: role("SNIPER_TAX_DECAY_SECONDS"),
    maxWalletBps: role("MAX_WALLET_BPS"),
    maxWalletWindowSeconds: role("MAX_WALLET_WINDOW_SECONDS"),
  },
  simulation: {
    usingBigBlocksRpcFlag: false,
    fastBlockGasLimit: fastBlockGasLimit.toString(),
    bigBlocksRequiredForBroadcast: oversizedTransactions.length > 0,
    oversizedTransactions,
    transactionCount: transactions.length,
    totalGasLimit: totalGasLimit.toString(),
    transactions,
  },
};

const output = resolve(`packages/contracts/deployments/${chain}/${network}-predeploy.json`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${output} with ${transactions.length} simulated transactions (${totalGasLimit} aggregate gas limit).`);
