import clsx from "clsx";

const clamp = (v: number) => Math.max(1, Math.min(100, v));

export function Progress({ value, className, glow }: { value: number; className?: string; glow?: boolean }) {
  return (
    <div className={clsx("h-1 w-full overflow-hidden bg-line", className)}>
      <div className={clsx("h-full", glow ? "bg-primary" : "bg-mint")} style={{ width: `${clamp(value)}%` }} />
    </div>
  );
}
