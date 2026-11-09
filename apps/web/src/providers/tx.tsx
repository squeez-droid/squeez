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
  run: (request: TxRequest, execute?: () => Promise<{ hash: string; wait: () => Promise<void> }>) => Promise<void>;
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

  const run = useCallback(async (request: TxRequest, execute?: () => Promise<{ hash: string; wait: () => Promise<void> }>) => {
    if (!execute) {
      setState({ ...request, phase: "error", error: "This action is not connected to an on-chain transaction." });
      return;
    }
    setState({ ...request, phase: "signing" });
    try {
      const pending = await execute();
      setState({ ...request, phase: "pending", hash: pending.hash });
      await pending.wait();
      setState({ ...request, phase: "success", hash: pending.hash });
      request.onSuccess?.();
      toast({ title: request.successTitle ?? "Transaction confirmed", body: request.successBody, kind: "success" });
    } catch (cause) {
      setState({
        ...request,
        phase: "error",
        error: cause instanceof Error ? cause.message.split("\n")[0] : "Transaction failed.",
      });
    }
  }, [toast]);

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
