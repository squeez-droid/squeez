"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, zeroAddress, type Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { feeVaultAbi } from "@/lib/abis";
import { listIndexedCreatorFees, listIndexedTokens, type IndexedToken } from "@/lib/indexer";
import { useProtocolConfig } from "@/lib/protocol-config";
import type { Token } from "@/lib/types";
import { useTx } from "@/providers/tx";
import { useWallet } from "@/providers/wallet";

interface CreatorReward {
  token: IndexedToken;
  claimableHype: number;
  lifetimeHype: number;
  claimedHype: number;
  vesting?: {
    startAt: string;
    endAt: string;
    lockedTokens: number;
    releasedTokens: number;
    claimableTokens: number;
  };
}

interface HolderReward {
  token: Token;
  claimableHype: number;
  claimedHype: number;
  weight: string;
}

interface ClaimHistory {
  token: string;
  symbol: string;
  kind: "creator" | "holder";
  amountHype: number;
  timestamp: string;
  txHash: string;
}

export const claimKey = {
  creator: (token: { address: string }) => token.address,
  holder: (token: { address: string }) => `h${token.address}`,
  vest: (token: { address: string }) => `v${token.address}`,
};

export function useRewards() {
  const tx = useTx();
  const wallet = useWallet();
  const protocol = useProtocolConfig();
  const publicClient = usePublicClient();
  const writer = useWriteContract();
  const [created, setCreated] = useState<CreatorReward[]>([]);
  const [history, setHistory] = useState<ClaimHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feeVault = protocol.data?.contracts.feeVault ?? undefined;

  const load = useCallback(async () => {
    if (!wallet.address || !feeVault || !publicClient) return;
    setLoading(true);
    setError(null);
    try {
      const tokens = (await listIndexedTokens()).filter(
        (token) => token.feeRecipient.toLowerCase() === wallet.address!.toLowerCase(),
      );
      const rows = await Promise.all(tokens.map(async (token) => {
        const [claimable, events] = await Promise.all([
          publicClient.readContract({
            address: feeVault, abi: feeVaultAbi, functionName: "creatorFeesAccrued",
            args: [token.address, zeroAddress],
          }),
          listIndexedCreatorFees(token.address),
        ]);
        const nativeEvents = events.filter((event) => event.asset.toLowerCase() === zeroAddress);
        const accrued = nativeEvents.filter((event) => event.kind === "accrued")
          .reduce((sum, event) => sum + BigInt(event.amount), 0n);
        const claimed = nativeEvents.filter((event) => event.kind === "claimed")
          .reduce((sum, event) => sum + BigInt(event.amount), 0n);
        return {
          reward: {
            token,
            claimableHype: Number(formatEther(claimable)),
            lifetimeHype: Number(formatEther(accrued)),
            claimedHype: Number(formatEther(claimed)),
          },
          claims: nativeEvents.filter((event) => event.kind === "claimed").map((event) => ({
            token: token.address,
            symbol: token.symbol ?? "TOKEN",
            kind: "creator" as const,
            amountHype: Number(formatEther(BigInt(event.amount))),
            timestamp: event.timestamp,
            txHash: event.txHash,
          })),
        };
      }));
      setCreated(rows.map((row) => row.reward));
      setHistory(rows.flatMap((row) => row.claims).sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Creator rewards could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [wallet.address, feeVault, publicClient]);

  useEffect(() => { void load(); }, [load]);

  const claimTokens = useCallback((tokens: Address[], label: string) => {
    if (!feeVault || !publicClient || !wallet.address || tokens.length === 0) return;
    void tx.run({
      title: label,
      wallet: wallet.address,
      lines: [{ label: "Fee asset", value: "Native HYPE" }, { label: "Tokens", value: String(tokens.length) }],
      successTitle: "Creator fees claimed",
      successBody: "The on-chain balance and indexed claim history will refresh shortly.",
      onSuccess: () => { void load(); window.setTimeout(() => void load(), 4000); },
    }, async () => {
      let finalHash: `0x${string}` | undefined;
      for (const token of tokens) {
        finalHash = await writer.writeContractAsync({
          address: feeVault, abi: feeVaultAbi, functionName: "claimCreatorFees", args: [token, zeroAddress],
        });
        await publicClient.waitForTransactionReceipt({ hash: finalHash });
      }
      if (!finalHash) throw new Error("No claimable creator fee was found.");
      return { hash: finalHash, wait: async () => undefined };
    });
  }, [feeVault, publicClient, wallet.address, tx, writer, load]);

  const totals = useMemo(() => created.reduce((sum, item) => ({
    claimable: sum.claimable + item.claimableHype,
    lifetime: sum.lifetime + item.lifetimeHype,
    claimed: sum.claimed + item.claimedHype,
  }), { claimable: 0, lifetime: 0, claimed: 0 }), [created]);

  return {
    isDemo: false,
    loading, error, reload: load,
    created,
    holderRewards: [] as HolderReward[],
    history,
    totalClaimable: totals.claimable,
    totalLifetime: totals.lifetime,
    totalClaimed: totals.claimed,
    claimed: {} as Record<string, boolean>,
    claimable: (_key: string, amount: number) => amount,
    claim: (key: string, _amount: number, label: string) => claimTokens([key as Address], `Claim ${label} creator fees`),
    claimAll: () => claimTokens(created.filter((item) => item.claimableHype > 0).map((item) => item.token.address), "Claim all creator fees"),
    claimVest: (...args: [IndexedToken, number, string]) => { void args; },
  };
}

export type RewardsApi = ReturnType<typeof useRewards>;
