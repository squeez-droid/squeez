import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeploymentEnv } from "../tools/deployment-address-book.mjs";

const network = process.argv[2] ?? process.env.SQUEEZ_NETWORK;
if (!['testnet', 'mainnet'].includes(network)) throw new Error("Usage: build-deployment-manifest.mjs <testnet|mainnet>");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const chainId = String(process.env.ELYSIUM_CHAIN_ID ?? "");
if (!/^\d+$/.test(chainId)) throw new Error("ELYSIUM_CHAIN_ID is required");
const deploymentDirectory = join(root, "packages/contracts/deployments");
const broadcastRoot = join(root, "packages/contracts/broadcast");

const fragments = [
  `${network}.json`, `${network}-core-upgrade.json`, `${network}-curve-upgrade.json`,
  `${network}-v4-stack.json`, `${network}-graduation-infra.json`, `${network}-hook.json`,
  `${network}-hook-config.json`, `${network}-graduation.json`,
  `${network}-swap-router.json`,
  `${network}-launch-config.json`,
].filter((name) => existsSync(join(deploymentDirectory, name)));
const deployment = Object.assign({}, ...fragments.map((name) => JSON.parse(readFileSync(join(deploymentDirectory, name)))));
const directDeploymentTransactions = fragments.flatMap((name) => {
  const fragment = JSON.parse(readFileSync(join(deploymentDirectory, name), "utf8"));
  return (fragment.transactions ?? []).map((transaction) => ({ source: `packages/contracts/deployments/${name}`, ...transaction }));
});
const { values: resolvedEnvironment } = loadDeploymentEnv(root, network);

const hexNumber = (value) => value === undefined || value === null ? null : BigInt(value).toString();
const broadcasts = [];
if (existsSync(broadcastRoot)) {
  for (const scriptName of readdirSync(broadcastRoot).sort()) {
    const chainDirectory = join(broadcastRoot, scriptName, chainId);
    if (!existsSync(chainDirectory) || !statSync(chainDirectory).isDirectory()) continue;
    for (const filename of readdirSync(chainDirectory).filter((name) => /^run-\d+\.json$/.test(name)).sort()) {
      const path = join(chainDirectory, filename);
      const run = JSON.parse(readFileSync(path, "utf8"));
      const receipts = new Map((run.receipts ?? []).map((receipt) => [receipt.transactionHash?.toLowerCase(), receipt]));
      let totalGasUsed = 0n;
      let totalFeeWei = 0n;
      const transactions = (run.transactions ?? []).map((entry) => {
        const receipt = receipts.get(entry.hash?.toLowerCase()) ?? {};
        const gasUsed = BigInt(receipt.gasUsed ?? 0);
        const gasPrice = BigInt(receipt.effectiveGasPrice ?? 0);
        totalGasUsed += gasUsed;
        totalFeeWei += gasUsed * gasPrice;
        return {
          hash: entry.hash,
          transactionType: entry.transactionType,
          contractName: entry.contractName ?? null,
          contractAddress: entry.contractAddress ?? receipt.contractAddress ?? null,
          function: entry.function ?? null,
          arguments: entry.arguments ?? [],
          from: receipt.from ?? entry.transaction?.from ?? null,
          to: receipt.to ?? entry.transaction?.to ?? null,
          nonce: hexNumber(entry.transaction?.nonce),
          valueWei: hexNumber(entry.transaction?.value),
          gasLimit: hexNumber(entry.transaction?.gas),
          gasUsed: gasUsed.toString(),
          effectiveGasPriceWei: gasPrice.toString(),
          transactionFeeWei: (gasUsed * gasPrice).toString(),
          status: hexNumber(receipt.status),
          blockNumber: hexNumber(receipt.blockNumber),
          blockHash: receipt.blockHash ?? null,
          transactionIndex: hexNumber(receipt.transactionIndex),
          logCount: receipt.logs?.length ?? 0,
          additionalContracts: entry.additionalContracts ?? [],
        };
      });
      broadcasts.push({
        script: scriptName,
        file: `packages/contracts/broadcast/${scriptName}/${chainId}/${filename}`,
        timestamp: run.timestamp ?? null,
        commit: run.commit ?? null,
        pending: run.pending?.length ?? 0,
        transactionCount: transactions.length,
        totalGasUsed: totalGasUsed.toString(),
        totalTransactionFeeWei: totalFeeWei.toString(),
        transactions,
      });
    }
  }
}

const manifest = {
  schemaVersion: 1,
  network,
  chainId: Number(chainId),
  generatedAt: new Date().toISOString(),
  authoritativeFragments: fragments.map((name) => `packages/contracts/deployments/${name}`),
  deployment,
  resolvedAddresses: resolvedEnvironment,
  summary: {
    broadcastRuns: broadcasts.length,
    transactionCount: broadcasts.reduce((sum, run) => sum + run.transactionCount, 0) + directDeploymentTransactions.length,
    totalGasUsed: (broadcasts.reduce((sum, run) => sum + BigInt(run.totalGasUsed), 0n)
      + directDeploymentTransactions.reduce((sum, tx) => sum + BigInt(tx.gasUsed ?? 0), 0n)).toString(),
    totalTransactionFeeWei: (broadcasts.reduce((sum, run) => sum + BigInt(run.totalTransactionFeeWei), 0n)
      + directDeploymentTransactions.reduce((sum, tx) => sum + BigInt(tx.transactionFeeWei ?? 0), 0n)).toString(),
  },
  directDeploymentTransactions,
  broadcastHistory: broadcasts,
};
mkdirSync(deploymentDirectory, { recursive: true });
const output = join(deploymentDirectory, `${network}-manifest.json`);
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${basename(output)} with ${manifest.summary.transactionCount} transactions.`);
