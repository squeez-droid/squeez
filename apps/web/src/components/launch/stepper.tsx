"use client";
import clsx from "clsx";
import { content } from "@/lib/data";
import { IconCheck } from "@/components/icons";

interface StepperProps {
  step: number;
  canAdvance: boolean;
  onSelect: (i: number) => void;
  onBlocked: () => void;
}

export function Stepper({ step, canAdvance, onSelect, onBlocked }: StepperProps) {
  return (
    <ol className="mt-5 grid grid-cols-2 gap-2">
      {content.launch.steps.map((s, i) => (
        <li key={s.id}>
          <button
            disabled={i > 0 && !canAdvance}
            onClick={() => (i === 0 || canAdvance ? onSelect(i) : onBlocked())}
            className={clsx("flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors", step === i ? "border-white" : "border-line hover:border-white/50")}
          >
            <span
              className={clsx(
                "num flex h-7 w-7 items-center justify-center rounded-sm text-xs font-semibold",
                step > i ? "bg-white text-bg" : step === i ? "border border-white text-white" : "border border-line text-muted",
              )}
            >
              {step > i ? <IconCheck width={14} height={14} /> : i + 1}
            </span>
            <span>
              <span className="block text-sm font-medium text-white">{s.label}</span>
              <span className="block text-xs text-muted">{s.hint}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
