"use client";
import Link from "next/link";
import clsx from "clsx";
import { useTx } from "@/providers/tx";
import { config } from "@/lib/data";
import { Button, Modal, Row, Spinner } from "./ui";
import { IconCheck, IconClose } from "./icons";

export function TxModal() {
  const { state, close, reject } = useTx();
  if (!state) return null;
  const steps = [
    { id: "signing", label: "Confirm in wallet" },
    { id: "pending", label: `Waiting for block (${config.chain.blockTimeMs}ms)` },
    { id: "success", label: "Done" },
  ];
  const idx = state.phase === "error" ? 0 : steps.findIndex((s) => s.id === state.phase);
  return (
    <Modal open onClose={state.phase === "signing" || state.phase === "pending" ? () => {} : close} title={state.title}>
      {state.lines && (
        <div className="mb-4 rounded-lg bg-bg px-3 py-2">
          {state.lines.map((l) => <Row key={l.label} label={l.label} value={l.value} />)}
        </div>
      )}
      <ol className="space-y-3">
        {steps.map((s, i) => {
          const done = state.phase !== "error" && (i < idx || state.phase === "success");
          const active = i === idx && state.phase !== "success" && state.phase !== "error";
          const failed = state.phase === "error" && i === 0;
          return (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span className={clsx("flex h-6 w-6 items-center justify-center rounded-sm border text-xs",
                done && "border-primary bg-primary text-bg", active && "border-primary text-primary", failed && "border-down text-down", !done && !active && !failed && "border-line text-muted")}>
                {done ? <IconCheck width={14} height={14} /> : failed ? <IconClose width={14} height={14} /> : active ? <Spinner className="h-3 w-3" /> : i + 1}
              </span>
              <span className={clsx(done || active ? "text-white" : "text-muted", failed && "text-down")}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      {state.hash && (
        <a href={`${config.chain.explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer" className="num mt-4 block truncate text-xs text-white underline underline-offset-2">
          {state.hash} ↗
        </a>
      )}
      {state.phase === "error" && <p className="mt-4 rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{state.error}</p>}
      {state.phase === "success" && state.successBody && <p className="mt-4 text-sm text-muted">{state.successBody}</p>}
      <div className="mt-5 flex gap-2">
        {state.phase === "signing" && <Button variant="secondary" className="flex-1" onClick={reject}>Simulate: reject in wallet</Button>}
        {state.phase === "success" && state.successHref && (
          <Link href={state.successHref.href} onClick={close} className="flex-1"><Button className="w-full">{state.successHref.label}</Button></Link>
        )}
        {(state.phase === "success" || state.phase === "error") && <Button variant="secondary" className="flex-1" onClick={close}>Close</Button>}
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useTx();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={clsx("pointer-events-auto rounded-md border bg-surface px-4 py-3", t.kind === "success" ? "border-white/60" : t.kind === "error" ? "border-down/40" : "border-line")}>
          <div className={clsx("text-sm font-medium", t.kind === "success" ? "text-white" : t.kind === "error" ? "text-down" : "text-white")}>{t.title}</div>
          {t.body && <div className="num mt-0.5 text-xs text-muted">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
