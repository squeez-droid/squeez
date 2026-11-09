"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type TxPhase = "signing" | "pending" | "success" | "error";

export interface TxRequest {
  title: string;
  lines?: { label: string; value: string }[];
  successTitle?: string;
  successBody?: string;
  successHref?: { href: string; label: string };
  onSuccess?: () => void;
}

export interface TxState extends TxRequest {
  phase: TxPhase;
  hash?: string;
  error?: string;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  kind: "success" | "error" | "info";
}

interface TxCtx {
  state: TxState | null;
  /** Disabled until each caller is wired to a real wallet contract write. Never simulates a transaction. */
  run: (request: TxRequest) => void;
  reject: () => void;
  close: () => void;
  toasts: Toast[];
  toast: (toast: Omit<Toast, "id">) => void;
}

const Ctx = createContext<TxCtx | null>(null);

export function TxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TxState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((value: Omit<Toast, "id">) => {
    const id = Date.now();
    setToasts((current) => [...current, { ...value, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4500);
  }, []);

  const run = useCallback((request: TxRequest) => {
    setState({
      ...request,
      phase: "error",
      error: "This action is unavailable until the deployed contract address and real wallet transaction are configured.",
    });
  }, []);

  const reject = useCallback(() => {
    setState((current) => current ? { ...current, phase: "error", error: "Transaction rejected in wallet." } : current);
  }, []);

  const close = useCallback(() => setState(null), []);

  return <Ctx.Provider value={{ state, run, reject, close, toasts, toast }}>{children}</Ctx.Provider>;
}

export function useTx() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useTx used outside TxProvider");
  return value;
}
