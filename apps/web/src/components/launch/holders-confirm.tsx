"use client";
import { useEffect, useState } from "react";
import { content } from "@/lib/data";
import { Button, Modal } from "@/components/ui";

const T = content.launch.holdersModal;
const CONFIRMATIONS = content.launch.holdersConfirmations;

interface HoldersConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Two explicit confirmations before fees can be routed to holders (permanent choice). */
export function HoldersConfirm({ open, onClose, onConfirm }: HoldersConfirmProps) {
  const [checked, setChecked] = useState(() => CONFIRMATIONS.map(() => false));
  useEffect(() => {
    if (open) setChecked(CONFIRMATIONS.map(() => false));
  }, [open]);

  const toggle = (i: number, v: boolean) => setChecked((s) => s.map((x, j) => (j === i ? v : x)));

  return (
    <Modal open={open} onClose={onClose} title={T.title}>
      <p className="text-sm text-muted">{T.body}</p>
      <div className="mt-4 space-y-2">
        {CONFIRMATIONS.map((text, i) => (
          <label key={i} className="flex cursor-pointer gap-3 rounded-md border border-line bg-bg p-3 text-sm text-white">
            <input type="checkbox" checked={checked[i]} onChange={(e) => toggle(i, e.target.checked)} className="mt-0.5 accent-white" />
            {text}
          </label>
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>{T.cancel}</Button>
        <Button className="flex-1" disabled={!checked.every(Boolean)} onClick={onConfirm}>{T.confirm}</Button>
      </div>
    </Modal>
  );
}
