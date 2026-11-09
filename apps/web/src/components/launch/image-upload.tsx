"use client";
import clsx from "clsx";
import { content } from "@/lib/data";
import { IconUpload } from "@/components/icons";

const T = content.launch.form;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

interface ImageUploadProps {
  value: string | null;
  error?: string | null;
  onChange: (dataUrl: string) => void;
}

export function ImageUpload({ value, error, onChange }: ImageUploadProps) {
  const onFile = (file?: File) => {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) return alert("Use a PNG, JPEG, WebP, or GIF image.");
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
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <p className="mt-1 text-[11px] text-muted">{T.ipfsNote}</p>
      {error && <p className="mt-1 text-xs text-down">{error}</p>}
    </div>
  );
}
