import clsx from "clsx";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  intro?: ReactNode;
  action?: ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}

const sizeCls = { md: "", lg: "md:text-4xl", xl: "md:text-5xl" } as const;

/** Page title used at the top of every app page. */
export function PageHeader({ title, intro, action, size = "md", className }: PageHeaderProps) {
  return (
    <div className={clsx("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div>
        <h1 className={clsx("font-display text-3xl font-bold uppercase tracking-tight text-white", sizeCls[size])}>{title}</h1>
        {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  );
}
