import clsx from "clsx";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-white placeholder:text-muted/60 outline-none transition focus:border-white";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  right?: ReactNode;
  children: ReactNode;
}

/** Label + control + hint/error line. */
export function Field({ label, hint, error, children, right }: FieldProps) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-white">{label}</span>
        {right && <span className="text-xs text-muted">{right}</span>}
      </div>
      {children}
      {error ? <p className="mt-1 text-xs text-down">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={clsx(inputCls, className)} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={clsx(inputCls, "resize-none", className)} />;
}

/** Input with a fixed prefix/suffix (e.g. "$" or "HYPE"). */
export function AffixInput({ prefix, suffix, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; suffix?: ReactNode }) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
      <Input {...rest} className={clsx(prefix && "pl-6", suffix && "pr-16", className)} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
    </div>
  );
}
