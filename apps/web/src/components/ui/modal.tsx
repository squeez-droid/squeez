"use client";
import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { IconClose } from "../icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, children, title, width = "max-w-md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={clsx("w-full rounded-t-lg border border-line bg-surface sm:rounded-lg", width)} onClick={(e) => e.stopPropagation()} role="dialog">
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold text-white">{title}</h2>
            <button onClick={onClose} className="text-muted hover:text-white" aria-label="Close">
              <IconClose width={18} height={18} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
