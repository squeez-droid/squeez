"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useSelectedTarget } from "@/lib/use-selected-target";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "wrong-network";
export type WalletMode = "injected" | "walletconnect";

interface WalletCtx {
  status: WalletStatus;
  mode: WalletMode | null;
  address: string | null;
  balances: Record<string, number>;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connectInjected: () => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  authorizeSigning: () => Promise<void>;
  hasInjected: boolean;
  hasWalletConnect: boolean;
  error: string | null;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const selected = useSelectedTarget();
  const activeChain = selected.chain;
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectingMode, setConnectingMode] = useState<WalletMode | null>(null);
  const account = useAccount();
  const balance = useBalance({ address: account.address, chainId: activeChain.id });
  const { connectors, connectAsync } = useConnect();
  const { disconnect: disconnectWallet } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const injectedConnector = connectors.find((connector) => connector.type === "injected");
  const walletConnectConnector = connectors.find((connector) => connector.type === "walletConnect");
  const hasInjected = typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: unknown }).ethereum);

  const connectInjected = useCallback(async () => {
    if (!injectedConnector) return;
    setError(null);
    setConnectingMode("injected");
    try {
      await connectAsync({ connector: injectedConnector, chainId: activeChain.id });
      setModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.split("\n")[0] : "Wallet connection failed.");
    } finally {
      setConnectingMode(null);
    }
  }, [connectAsync, injectedConnector, activeChain.id]);

  const connectWalletConnect = useCallback(async () => {
    if (!walletConnectConnector) return;
    setError(null);
    setConnectingMode("walletconnect");
    try {
      await connectAsync({ connector: walletConnectConnector, chainId: activeChain.id });
      setModalOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.split("\n")[0] : "WalletConnect connection failed.");
    } finally {
      setConnectingMode(null);
    }
  }, [connectAsync, walletConnectConnector, activeChain.id]);

  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: activeChain.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.split("\n")[0] : "Network switch failed.");
    }
  }, [switchChainAsync, activeChain.id]);

  const authorizeSigning = useCallback(async () => {
    if (!account.connector || !account.address) throw new Error("Connect your wallet before signing.");
    const provider = await account.connector.getProvider() as {
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    } | undefined;
    if (!provider?.request) throw new Error("The connected wallet cannot authorize message signing.");
    const authorized = await provider.request({ method: "eth_requestAccounts" });
    const accounts = Array.isArray(authorized) ? authorized.filter((value): value is string => typeof value === "string") : [];
    if (!accounts.some((value) => value.toLowerCase() === account.address?.toLowerCase())) {
      throw new Error("The selected wallet account changed. Disconnect and reconnect the wallet, then try again.");
    }
  }, [account.connector, account.address]);

  const value = useMemo<WalletCtx>(() => {
    let status: WalletStatus = "disconnected";
    if (account.status === "connecting" || account.status === "reconnecting") status = "connecting";
    if (account.status === "connected") status = account.chainId === activeChain.id ? "connected" : "wrong-network";

    return {
      status,
      mode: account.status === "connected"
        ? account.connector?.type === "walletConnect" ? "walletconnect" : "injected"
        : connectingMode,
      address: account.address ?? null,
      balances: { [selected.info.nativeCurrency.symbol]: balance.data ? Number(balance.data.value) / 10 ** balance.data.decimals : 0 },
      modalOpen,
      error,
      hasInjected,
      hasWalletConnect: Boolean(walletConnectConnector),
      openModal: () => { setError(null); setModalOpen(true); },
      closeModal: () => setModalOpen(false),
      connectInjected,
      connectWalletConnect,
      disconnect: () => disconnectWallet(),
      switchNetwork,
      authorizeSigning,
    };
  }, [account.status, account.chainId, account.address, account.connector?.type, activeChain.id, selected.info.nativeCurrency.symbol, balance.data, modalOpen, error, hasInjected, walletConnectConnector, connectingMode, connectInjected, connectWalletConnect, disconnectWallet, switchNetwork, authorizeSigning]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useWallet used outside WalletProvider");
  return value;
}
