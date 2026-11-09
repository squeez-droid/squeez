import type { ReactNode } from "react";
import { Logo } from "../icons";

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 text-muted"><Logo size={28} /></div>
      <div className="font-medium text-white">{title}</div>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
