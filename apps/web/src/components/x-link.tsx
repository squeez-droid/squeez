import { IconX } from "./icons";

export const SQUEEZ_X_URL = "https://x.com/squeez7z";

export function XLink({ label = true, className = "" }: { label?: boolean; className?: string }) {
  return (
    <a
      href={SQUEEZ_X_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Squeez on X"
      className={`inline-flex items-center gap-1.5 transition-colors hover:text-white ${className}`}
    >
      <IconX width={14} height={14} />
      {label && <span>@squeez7z</span>}
    </a>
  );
}
