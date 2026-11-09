"use client";
import clsx from "clsx";
import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, size = "md", className }: SegmentedProps<T>) {
  return (
    <div className={clsx("inline-flex rounded-md border border-line bg-bg p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          onClick={() => onChange(o.id)}
          className={clsx(
            "rounded-md font-medium transition",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            o.id === value ? "bg-white text-bg" : "text-muted hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
