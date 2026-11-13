// One icon family: 1.5 stroke, 24px grid, sharp corners. Decorative → aria-hidden.
import type { SVGProps } from "react";
const base = (p: SVGProps<SVGSVGElement>) => ({ width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const, "aria-hidden": true, ...p });

export const IconArrowUpRight = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M7 17 17 7M8 7h9v9" /></svg>;
export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 12h16M14 6l6 6-6 6" /></svg>;
export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M20 12H4M10 6l-6 6 6 6" /></svg>;
export const IconCopy = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M9 9h11v11H9z" /><path d="M5 15H4V4h11v1" /></svg>;
export const IconClose = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconMenu = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const IconCheck = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m5 12 4.5 4.5L19 7" /></svg>;
export const IconLock = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const IconShield = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /></svg>;
export const IconSliders = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" /></svg>;
export const IconCrown = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></svg>;
export const IconGrad = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6" /></svg>;
export const IconGrid = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>;
export const IconList = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
export const IconWallet = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 6h16v14H3zM3 6l12-3v3M15 13h2" /></svg>;
export const IconBrowser = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 4h18v16H3zM3 9h18" /></svg>;
export const IconWalletConnect = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p} width={p.width ?? 16} height={p.height ?? 16} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M5.1 8.7c3.8-3.7 10-3.7 13.8 0l.5.5a.7.7 0 0 1 0 1l-1.7 1.7a.4.4 0 0 1-.6 0l-.7-.7a6.3 6.3 0 0 0-8.8 0l-.8.7a.4.4 0 0 1-.5 0l-1.7-1.7a.7.7 0 0 1 0-1l.5-.5Z" fill="currentColor" />
    <path d="m20.9 12.2 1.5 1.5a.7.7 0 0 1 0 1l-6.8 6.7a.7.7 0 0 1-1 0l-2.4-2.4a.3.3 0 0 0-.4 0l-2.4 2.4a.7.7 0 0 1-1 0l-6.8-6.7a.7.7 0 0 1 0-1l1.5-1.5a.7.7 0 0 1 1 0l4.8 4.7a.3.3 0 0 0 .4 0l2.4-2.3a.4.4 0 0 1 .6 0l2.4 2.3a.3.3 0 0 0 .4 0l4.8-4.7a.7.7 0 0 1 1 0Z" fill="currentColor" />
  </svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5" /></svg>;
export const IconUpload = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>;
export const IconWebsite = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12s1.2 6.5 3.6 9" /></svg>;
export const IconTelegram = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p} width={p.width ?? 16} height={p.height ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M21.7 3.3a1.5 1.5 0 0 0-1.55-.24L3.4 9.55a1.5 1.5 0 0 0 .08 2.83l4.12 1.37 1.55 4.83a1.5 1.5 0 0 0 2.55.55l2.25-2.3 4.26 3.13a1.5 1.5 0 0 0 2.35-.91l1.62-14.3a1.5 1.5 0 0 0-.48-1.45ZM9.08 12.45l8.64-5.2-6.94 6.55-.42 2.62-1.28-3.97Zm9.5 5.3-5.24-3.85 6.63-6.25-1.39 10.1Z" />
  </svg>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...p} width={p.width ?? 16} height={p.height ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25h6.826l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);

/** Squeez mark: two brackets squeezing one point. From "squeeze" + fixed supply. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none">
      <path d="M3 3h5v2H5v14h3v2H3zM21 3h-5v2h3v14h-3v2h5z" fill="currentColor" />
      <rect x="10" y="10" width="4" height="4" fill="currentColor" />
    </svg>
  );
}
