"use client";
import clsx from "clsx";
import { content } from "@/lib/data";
import { IconUpload } from "@/components/icons";
import { monogramDataUrl } from "./monogram";

const T = content.launch.form;
const MAX_BYTES = 2_000_000;

interface ImageUploadProps {
  value: string | null;
  ticker: string;
  error?: string | null;
  onChange: (dataUrl: string) => void;
}

export function ImageUpload({ value, ticker, error, onChange }: ImageUploadProps) {
  const onFile = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return alert(T.imageTooLarge);
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-white">{T.imageLabel}</div>
      <label
        className={clsx(
          "flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-bg text-center text-xs text-muted transition-colors focus-within:border-white hover:border-white",
          error ? "border-down" : "border-line",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <>
            <IconUpload width={20} height={20} className="text-white" />
            <span className="mt-2">{T.imageHint}<br />{T.imageMax}</span>
          </>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <button
        type="button"
        disabled={ticker.length < 2}
        onClick={() => onChange(monogramDataUrl(ticker))}
        className="mt-2 w-full rounded-md border border-line py-1.5 text-xs text-muted hover:text-white disabled:opacity-40"
      >
        {T.useMonogram}
      </button>
      <p className="mt-1 text-[11px] text-muted">{T.ipfsNote}</p>
      {error && <p className="mt-1 text-xs text-down">{error}</p>}
    </div>
  );
}
