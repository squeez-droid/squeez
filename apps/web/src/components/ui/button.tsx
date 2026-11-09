"use client";
import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "sell";
export type ButtonSize = "sm" | "md" | "lg";

const sizeCls: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

const variantCls: Record<ButtonVariant, string> = {
  primary: "bg-primary text-bg hover:bg-mint",
  secondary: "border border-line bg-transparent text-white hover:border-white/60",
  ghost: "text-muted hover:bg-surface hover:text-white",
  danger: "border border-down/50 text-down hover:bg-down/10",
  sell: "border border-white bg-transparent text-white hover:bg-white/10",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", className, loading, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
        sizeCls[size],
        variantCls[variant],
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
