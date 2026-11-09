import clsx from "clsx";
import type { ReactNode } from "react";

/** Label / value line used in summaries and breakdowns. */
export function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-between gap-3 py-1 text-sm", className)}>
      <span className="text-muted">{label}</span>
      <span className="num text-right text-white">{value}</span>
    </div>
  );
}

/** Square colour swatch + label, for legends. */
export function Swatch({ cls, children }: { cls: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={clsx("h-2 w-2", cls)} />
      {children}
    </span>
  );
}
