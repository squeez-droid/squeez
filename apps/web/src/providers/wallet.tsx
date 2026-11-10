"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useSelectedTarget } from "@/lib/use-selected-target";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "wrong-network";

interface WalletCtx {
  status: WalletStatus;
  mode: "injected" | null;
  address: string | null;
  balances: Record<string, number>;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connectInjected: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  hasInjected: boolean;
  error: string | null;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const selected = useSelectedTarget();
  const activeChain = selected.chain;
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = useAccount();
  const balance = useBalance({ address: account.address, chainId: activeChain.id });
  const { connectors, connectAsync } = useConnect();
  const { disconnect: disconnectWallet } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const injectedConnector = connectors.find((connector) => connector.type === "injected");
  const hasInjected = typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: unknown }).ethereum);

  const connectInjected = useCallback(async () => {
    if (!injectedConnector) return;
    setError(null);
    try {
      await connectAsync({ connector: injectedConnector, chainId: activeChain.id });
      setModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.split("\n")[0] : "Wallet connection failed.");
    }
  }, [connectAsync, injectedConnector, activeChain.id]);

  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: activeChain.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.split("\n")[0] : "Network switch failed.");
    }
  }, [switchChainAsync, activeChain.id]);

  const value = useMemo<WalletCtx>(() => {
    let status: WalletStatus = "disconnected";
    if (account.status === "connecting" || account.status === "reconnecting") status = "connecting";
    if (account.status === "connected") status = account.chainId === activeChain.id ? "connected" : "wrong-network";

    return {
      status,
      mode: account.status === "connected" ? "injected" : null,
      address: account.address ?? null,
      balances: { [selected.info.nativeCurrency.symbol]: balance.data ? Number(balance.data.value) / 10 ** balance.data.decimals : 0 },
      modalOpen,
      error,
      hasInjected,
      openModal: () => { setError(null); setModalOpen(true); },
      closeModal: () => setModalOpen(false),
      connectInjected,
      disconnect: () => disconnectWallet(),
      switchNetwork,
    };
  }, [account.status, account.chainId, account.address, activeChain.id, selected.info.nativeCurrency.symbol, balance.data, modalOpen, error, hasInjected, connectInjected, disconnectWallet, switchNetwork]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useWallet used outside WalletProvider");
  return value;
}
