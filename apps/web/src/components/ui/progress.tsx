"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));

export function Progress({ value, className, glow }: { value: number; className?: string; glow?: boolean }) {
  const safeValue = clamp(value);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue * 10) / 10}
      className={clsx("bonding-progress relative h-1 w-full overflow-hidden bg-line", className)}
    >
      {safeValue < 100 && <span aria-hidden className="bonding-progress-ambient absolute inset-0" />}
      {safeValue < 1 && <span aria-hidden className="bonding-progress-origin absolute inset-y-0 left-0 w-1" />}
      <div
        className={clsx("bonding-progress-fill relative h-full overflow-hidden", glow ? "bg-primary" : "bg-mint", safeValue >= 25 && "bonding-progress-milestone", safeValue >= 80 && "bonding-progress-glow")}
        style={{ width: `${safeValue}%` }}
      >
        {safeValue > 0 && safeValue < 100 && <span aria-hidden className="bonding-progress-shimmer absolute inset-0" />}
      </div>
      <span aria-hidden className="bonding-progress-ticks absolute inset-0" />
    </div>
  );
}

export function AnimatedProgressValue({ value, digits = 1, className }: { value: number; digits?: number; className?: string }) {
  const target = clamp(value);
  const [display, setDisplay] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target;
      setDisplay(target);
      return;
    }
    const from = current.current;
    const started = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const elapsed = Math.min(1, (now - started) / 850);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = from + (target - from) * eased;
      current.current = next;
      setDisplay(next);
      if (elapsed < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return <span className={className}>{display.toFixed(digits)}%</span>;
}
