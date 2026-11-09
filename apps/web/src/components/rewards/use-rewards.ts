"use client";

import type { Token } from "@/lib/types";
import { useTx } from "@/providers/tx";

interface CreatorReward {
  token: Token;
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
  kind: "creator" | "holder";
  amountHype: number;
  timestamp: string;
  txHash: string;
}

export const claimKey = {
  creator: (token: Token) => token.address,
  holder: (token: Token) => `h${token.address}`,
  vest: (token: Token) => `v${token.address}`,
};

/** Empty until FeeVault reads and indexed reward history are connected. */
export function useRewards() {
  const tx = useTx();
  const unavailable = () => tx.run({ title: "Rewards unavailable" });

  return {
    isDemo: false,
    created: [] as CreatorReward[],
    holderRewards: [] as HolderReward[],
    history: [] as ClaimHistory[],
    totalClaimable: 0,
    totalLifetime: 0,
    totalClaimed: 0,
    claimed: {} as Record<string, boolean>,
    claimable: (key: string, amount: number) => { void key; void amount; return 0; },
    claim: (key: string, amount: number, label: string) => { void key; void amount; void label; unavailable(); },
    claimAll: unavailable,
    claimVest: (token: Token, amount: number, title: string) => { void token; void amount; void title; unavailable(); },
  };
}

export type RewardsApi = ReturnType<typeof useRewards>;
