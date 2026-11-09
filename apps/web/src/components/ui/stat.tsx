import clsx from "clsx";
import type { ReactNode } from "react";

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-0.5 truncate text-[15px] font-semibold text-white">{value}</div>
      {sub && <div className="num text-xs text-muted">{sub}</div>}
    </div>
  );
}
