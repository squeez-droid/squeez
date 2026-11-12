"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

const address = process.env.NEXT_PUBLIC_SQUEEZ_TOKEN_ADDRESS?.trim();

export function ContractAddressBadge() {
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy SQUEEZ contract address"
      className="mt-4 flex max-w-full items-start gap-2 border border-line bg-bg/70 px-3 py-2 text-left text-[11px] text-white transition-colors hover:border-white"
    >
      <span className="num shrink-0 uppercase text-muted">SQUEEZ CA</span>
      <span className="num break-all">{address}</span>
      {copied ? <IconCheck className="mt-0.5 shrink-0 text-emerald-400" /> : <IconCopy className="mt-0.5 shrink-0" />}
    </button>
  );
}
