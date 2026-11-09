import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

/** Selectable bordered tile (pair picker, fee destinations, ...). */
export function ChoiceCard({ selected, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={clsx(
        "rounded-md border text-left transition disabled:cursor-not-allowed disabled:opacity-40",
        selected ? "border-white bg-surface2" : "border-line bg-bg hover:border-white/50",
        className,
      )}
    />
  );
}
