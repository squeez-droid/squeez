import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone = "default" | "primary" | "mint" | "warn" | "down" | "muted";

const toneCls: Record<BadgeTone, string> = {
  default: "bg-line text-white/80",
  primary: "border border-line text-white",
  mint: "bg-white text-bg",
  warn: "border border-white/70 text-white",
  down: "bg-down/15 text-down",
  muted: "bg-line/60 text-muted",
};

export function Badge({ children, tone = "default", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide", toneCls[tone], className)}>
      {children}
    </span>
  );
}
