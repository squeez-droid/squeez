"use client";
import clsx from "clsx";
import { IconCopy } from "../icons";

export function CopyButton({ text, className }: { text: string; className?: string }) {
  return (
    <button
      aria-label="Copy"
      title="Copy"
      className={clsx("inline-flex h-6 w-6 items-center justify-center text-muted hover:text-white", className)}
      onClick={(e) => {
        e.preventDefault();
        navigator.clipboard?.writeText(text);
      }}
    >
      <IconCopy width={13} height={13} />
    </button>
  );
}
