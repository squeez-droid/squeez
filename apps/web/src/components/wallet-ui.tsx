"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/providers/wallet";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { useProtocolConfig } from "@/lib/protocol-config";
import { useDataSourceStatus } from "@/lib/indexer";
import { useCommunityCanary } from "@/lib/community-canary";
import { fmtNum, shortAddr } from "@/lib/format";
import { Button, Modal, Spinner } from "./ui";
import { IconBrowser } from "./icons";

export function WalletButton() {
  const selected = useSelectedTarget();
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (w.status === "disconnected") return <Button size="md" onClick={w.openModal}>Connect</Button>;
  if (w.status === "connecting") return <Button size="md" variant="secondary" loading>Connecting</Button>;
  if (w.status === "wrong-network")
    return <Button size="md" variant="danger" onClick={w.switchNetwork}>Wrong network</Button>;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm hover:border-white/60">
        <span className="num hidden text-white sm:inline">{fmtNum(w.balances[selected.info.nativeCurrency.symbol] ?? 0, 2)} {selected.info.nativeCurrency.symbol}</span>
        <span className="hidden h-4 w-px bg-line sm:inline" />
        <span aria-hidden className="h-3 w-3 bg-white" />
        <span className="num text-white">{shortAddr(w.address)}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-md border border-line bg-surface p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="num text-sm text-white">{shortAddr(w.address, 6)}</div>
              <div className="text-xs text-muted">Browser wallet · {selected.chain.name}</div>
            </div>
            <span className="num text-[10px] uppercase text-muted">online</span>
          </div>
          <div className="space-y-1 rounded-lg bg-bg p-2.5">
            {Object.entries(w.balances).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm"><span className="text-muted">{k}</span><span className="num text-white">{fmtNum(v, 4)}</span></div>
            ))}
          </div>
          <div className="mt-3 grid gap-1 text-sm">
            <Link href="/rewards" onClick={() => setOpen(false)} className="rounded-md px-2 py-1.5 text-white/90 hover:bg-bg">Creator rewards</Link>
            {selected.info.faucet && (
              <a href={selected.info.faucet} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1.5 text-white/90 hover:bg-bg">Faucet testnet ↗</a>
            )}
            {selected.info.bridge && (
              <a href={selected.info.bridge} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1.5 text-white/90 hover:bg-bg">Bridge ↗</a>
            )}
            <button onClick={() => { w.disconnect(); setOpen(false); }} className="rounded-md px-2 py-1.5 text-left text-down hover:bg-bg">Disconnect</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WalletModal() {
  const w = useWallet();
  const selected = useSelectedTarget();
  const connecting = w.status === "connecting";
  return (
    <Modal open={w.modalOpen} onClose={w.closeModal} title="Connect wallet">
      <div className="space-y-2">
        <WalletOption icon={<IconBrowser width={22} height={22} />} title="Browser wallet" sub={w.hasInjected ? "MetaMask, Rabby, etc." : "Not detected in this browser"} disabled={!w.hasInjected || connecting} loading={connecting && w.mode === "injected"} onClick={w.connectInjected} />
      </div>
      {w.error && <p className="mt-3 rounded-lg bg-down/10 px-3 py-2 text-xs text-down">{w.error}</p>}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Squeez runs on {selected.chain.name}. Gas uses {selected.info.nativeCurrency.symbol}.
        {selected.info.faucet && (
          <>
            {" "}Need testnet {selected.info.nativeCurrency.symbol}? Get some from the{" "}
            <a className="text-white underline underline-offset-2" href={selected.info.faucet} target="_blank" rel="noreferrer">faucet</a>.
          </>
        )}
      </p>
    </Modal>
  );
}

function WalletOption({ icon, title, sub, onClick, disabled, loading }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex w-full items-center gap-3 rounded-md border border-line bg-bg px-4 py-3.5 text-left transition-colors hover:border-white disabled:opacity-50">
      <span className="text-white">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-white">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      {loading && <Spinner className="text-white" />}
    </button>
  );
}

export function NetworkBanner() {
  const w = useWallet();
  const selected = useSelectedTarget();
  if (w.status !== "wrong-network") return null;
  return (
    <div className="border-b border-down/40 bg-bg">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="text-down">Your wallet is not on {selected.chain.name}. Trading and launching are disabled.</span>
        <Button size="sm" variant="danger" onClick={w.switchNetwork}>Switch network</Button>
      </div>
    </div>
  );
}

/** Action button that follows wallet state: connect → switch network → action. */
export function WalletGateButton({ children, onClick, disabled, className, variant = "primary", size = "lg" }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; className?: string; variant?: "primary" | "sell"; size?: "md" | "lg" }) {
  const w = useWallet();
  const selected = useSelectedTarget();
  const protocol = useProtocolConfig();
  const dataSource = useDataSourceStatus();
  const canary = useCommunityCanary();
  if (protocol.data?.capability === "read-only") return <Button size={size} className={className} variant="secondary" disabled>Read only</Button>;
  if (canary.isMainnet && !canary.open) return <Button size={size} className={className} variant="secondary" disabled>Canary not open</Button>;
  if (dataSource.data?.writeSafe === false) {
    return <Button size={size} className={className} variant="secondary" disabled>Writes paused</Button>;
  }
  if (w.status === "disconnected") return <Button size={size} className={className} onClick={w.openModal}>Connect wallet</Button>;
  if (w.status === "connecting") return <Button size={size} className={className} variant="secondary" loading>Connecting</Button>;
  if (w.status === "wrong-network") return <Button size={size} className={className} variant="danger" onClick={w.switchNetwork}>Switch to {selected.chain.name}</Button>;
  return <Button size={size} variant={variant} className={className} onClick={onClick} disabled={disabled}>{children}</Button>;
}
