import { Pool } from "pg";
import {
  createPublicClient, createWalletClient, defineChain, http, parseAbi, type Address, type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LOG_EVENTS } from "@squeez/shared";
import type { KeeperConfig } from "./config";
import { logKeeper } from "./system-log";

const curveAbi = parseAbi([
  "function graduated() view returns (bool)",
  "function graduationState() view returns (uint8)",
  "function graduate()",
]);

type Candidate = { address: Address; curve: Address };

export function createGraduationKeeper(cfg: KeeperConfig) {
  const pool = new Pool({ connectionString: cfg.databaseUrl, max: 2 });
  const account = privateKeyToAccount(cfg.privateKey);
  const chain = defineChain({
    id: cfg.chainId,
    name: `${cfg.chain} ${cfg.network}`,
    nativeCurrency: { name: "Native", symbol: cfg.chain === "robinhood" ? "ETH" : "HYPE", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpc] } },
  });
  const transport = http(cfg.rpc, { timeout: 15_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  async function candidates(): Promise<Candidate[]> {
    const result = await pool.query(
      `select address, curve from "${cfg.databaseSchema}".token
       where status = 'graduating' order by launch_block_number asc limit 20`,
    );
    return result.rows as Candidate[];
  }

  async function finalize(candidate: Candidate): Promise<Hash | null> {
    const [thresholdReached, state] = await Promise.all([
      publicClient.readContract({ address: candidate.curve, abi: curveAbi, functionName: "graduated" }),
      publicClient.readContract({ address: candidate.curve, abi: curveAbi, functionName: "graduationState" }),
    ]);
    if (!thresholdReached || state === 2) return null;

    const requestId = crypto.randomUUID();
    logKeeper(cfg, requestId, LOG_EVENTS.graduationRequested, "info", undefined, { token: candidate.address });
    try {
      const { request } = await publicClient.simulateContract({
        account, address: candidate.curve, abi: curveAbi, functionName: "graduate",
      });
      const hash = await walletClient.writeContract(request);
      logKeeper(cfg, requestId, LOG_EVENTS.graduationSubmitted, "info", undefined, {
        token: candidate.address, txHash: hash, context: { curve: candidate.curve },
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error(`Graduation transaction reverted: ${hash}`);
      logKeeper(cfg, requestId, LOG_EVENTS.graduationConfirmed, "info", undefined, {
        token: candidate.address, txHash: hash,
        context: { curve: candidate.curve, blockNumber: receipt.blockNumber.toString() },
      });
      return hash;
    } catch (error) {
      logKeeper(cfg, requestId, LOG_EVENTS.graduationFailed, "error",
        error instanceof Error ? error.message.split("\n")[0] : "Unknown graduation failure",
        { token: candidate.address, context: { curve: candidate.curve } });
      return null;
    }
  }

  return {
    account: account.address,
    async tick() {
      if (!cfg.graduationEnabled) return [];
      const pending = await candidates();
      const hashes: Hash[] = [];
      for (const candidate of pending) {
        const hash = await finalize(candidate);
        if (hash) hashes.push(hash);
      }
      return hashes;
    },
    async close() { await pool.end(); },
  };
}
