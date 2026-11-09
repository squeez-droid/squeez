"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { LOG_EVENTS } from "@squeez/shared";
import { apiUrl } from "@/lib/chain";

export type TxPhase = "signing" | "pending" | "success" | "error";

export interface TxRequest {
  title: string;
  lines?: { label: string; value: string }[];
  successTitle?: string;
  successBody?: string;
  successHref?: { href: string; label: string };
  onSuccess?: () => void;
  wallet?: string;
}

export interface TxState extends TxRequest {
  phase: TxPhase;
  hash?: string;
  error?: string;
  requestId: string;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  kind: "success" | "error" | "info";
}

interface TxCtx {
  state: TxState | null;
  /** Runs a real wallet transaction and records its request/submission/receipt lifecycle. */
  run: (request: TxRequest, execute?: (requestId: string) => Promise<{ hash: string; wait: () => Promise<void> }>) => Promise<void>;
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

  const log = useCallback((event: string, requestId: string, request: TxRequest, extra: Record<string, string> = {}) => {
    void fetch(`${apiUrl}/v1/logs`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, requestId, wallet: request.wallet, ...extra }) }).catch(() => undefined);
  }, []);

  const run = useCallback(async (request: TxRequest, execute?: (requestId: string) => Promise<{ hash: string; wait: () => Promise<void> }>) => {
    const requestId = crypto.randomUUID();
    if (!execute) {
      setState({ ...request, requestId, phase: "error", error: "This action is not connected to an on-chain transaction." });
      return;
    }
    log(LOG_EVENTS.txRequested, requestId, request);
    setState({ ...request, requestId, phase: "signing" });
    try {
      const pending = await execute(requestId);
      log(LOG_EVENTS.txSubmitted, requestId, request, { txHash: pending.hash });
      setState({ ...request, requestId, phase: "pending", hash: pending.hash });
      await pending.wait();
      log(LOG_EVENTS.txConfirmed, requestId, request, { txHash: pending.hash });
      setState({ ...request, requestId, phase: "success", hash: pending.hash });
      request.onSuccess?.();
      toast({ title: request.successTitle ?? "Transaction confirmed", body: request.successBody, kind: "success" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.split("\n")[0] : "Transaction failed.";
      const rejected = /reject|denied|cancel/i.test(message);
      log(rejected ? LOG_EVENTS.txRejected : LOG_EVENTS.txFailed, requestId, request, { message });
      setState({
        ...request, requestId,
        phase: "error",
        error: message,
      });
    }
  }, [toast, log]);

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
