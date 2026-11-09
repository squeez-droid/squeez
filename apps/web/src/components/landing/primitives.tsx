import clsx from "clsx";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { pad } from "@/lib/format";
import { IconArrowRight } from "@/components/icons";

/** Mono uppercase micro label used across the landing page. */
export const labelCls = "num text-[11px] uppercase tracking-[0.14em] text-muted";
/** Display font at normal width (Archivo defaults to wide). */
export const normalWidth: CSSProperties = { fontStretch: "100%" };
/** Staggered reveal delay for `data-reveal` elements. */
export const revealDelay = (ms: number) => ({ ["--d" as string]: `${ms}ms` }) as CSSProperties;

export const Container = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={clsx("mx-auto max-w-[90rem] px-4 md:px-8", className)}>{children}</div>
);

/** Rule + "[ TAG ]" on the left + running index "001" on the right. */
export function SectionLabel({ tag, n, ruled = true }: { tag: string; n?: number; ruled?: boolean }) {
  return (
    <div className={clsx("flex items-center justify-between", ruled && "border-t border-line pt-3")}>
      <span className={labelCls}>[ {tag} ]</span>
      {n !== undefined && <span className={labelCls}>{pad(n, 3)}</span>}
    </div>
  );
}

export const SectionTitle = ({ id, children, className }: { id?: string; children: ReactNode; className?: string }) => (
  <h2 id={id} data-reveal="line" className={clsx("font-display text-[2.25rem] font-semibold leading-[0.95] tracking-[-0.035em] text-white md:text-[4.25rem]", className)} style={normalWidth}>
    {children}
  </h2>
);

interface SectionHeadProps {
  id: string;
  n: number;
  tag: string;
  title: string;
  aside?: ReactNode;
}

/** Section opener: bracketed label + running index, then a large heading with an optional aside. */
export function SectionHead({ id, n, tag, title, aside }: SectionHeadProps) {
  return (
    <header id={id} className="scroll-mt-20">
      <SectionLabel tag={tag} n={n} />
      <div className="mt-8 grid gap-6 md:mt-12 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end">
        <SectionTitle className="max-w-4xl">{title}</SectionTitle>
        {aside && (
          <div data-reveal style={revealDelay(150)} className="text-sm leading-relaxed text-mint/80 md:pb-2">
            {aside}
          </div>
        )}
      </div>
    </header>
  );
}

const ctaBase = "group inline-flex h-12 items-center justify-center gap-3 px-5 text-[15px] font-medium transition-colors";
const ctaVariant = {
  solid: "bg-white text-bg hover:bg-mint",
  outline: "border border-line text-white hover:border-white",
};

interface CtaLinkProps {
  href: string;
  variant?: keyof typeof ctaVariant;
  external?: boolean;
  arrow?: boolean;
  children: ReactNode;
}

/** Big landing call-to-action (internal route or external link). */
export function CtaLink({ href, variant = "solid", external, arrow, children }: CtaLinkProps) {
  const cls = clsx(ctaBase, ctaVariant[variant]);
  const content = (
    <>
      {children}
      {arrow && <IconArrowRight width={16} height={16} className="transition-transform group-hover:translate-x-1" />}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>{content}</a>
  ) : (
    <Link href={href} className={cls}>{content}</Link>
  );
}

/** Two-column key/value list with ruled rows. */
export function KeyValueList({ rows, className, children }: { rows: { k: string; v: ReactNode }[]; className?: string; children?: ReactNode }) {
  return (
    <dl className={clsx("border-t border-line", className)}>
      {rows.map((r) => (
        <div key={r.k} className="flex items-baseline justify-between gap-4 border-b border-line py-3 text-sm">
          <dt className="text-muted">{r.k}</dt>
          <dd className="num text-right text-white">{r.v}</dd>
        </div>
      ))}
      {children}
    </dl>
  );
}
