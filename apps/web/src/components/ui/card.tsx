import clsx from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  className?: string;
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
}

export function Card({ className, children, title, action }: CardProps) {
  return (
    <section className={clsx("rounded-xl border border-line bg-surface", className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white">{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
