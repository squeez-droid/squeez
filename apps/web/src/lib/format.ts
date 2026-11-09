export const shortAddr = (a?: string | null, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "");

export function fmtNum(v: number, max = 2) {
  if (!isFinite(v)) return "–";
  return v.toLocaleString("en-US", { maximumFractionDigits: max });
}

export function fmtCompact(v: number, digits = 2) {
  if (!isFinite(v)) return "–";
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(digits) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(digits) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(digits) + "K";
  return v.toFixed(abs < 10 ? digits : 0);
}

export const fmtUsd = (v: number, compact = true) =>
  compact ? "$" + fmtCompact(v) : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** small prices: 0.0₅1234 */
export function fmtPrice(v: number) {
  if (!isFinite(v) || v === 0) return "0";
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const s = v.toFixed(20);
  const m = s.match(/^0\.(0*)(\d{1,4})/);
  if (!m) return v.toPrecision(4);
  const zeros = m[1].length;
  if (zeros < 4) return v.toPrecision(4).replace(/0+$/, "");
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[+d]).join("");
  return `0.0${sub}${m[2]}`;
}

export const fmtPct = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
export const bpsToPct = (b: number) => `${(b / 100).toFixed(b % 100 === 0 ? 0 : b % 10 === 0 ? 1 : 2)}%`;

export function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Zero-pad an index: pad(3) → "03", pad(3, 3) → "003". */
export const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Fill `{key}` placeholders in a copy string from data/*.json. */
export const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export const isAddress = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a);

/** Short human label for a token's creator-fee destination. */
export function feeDestinationLabel(d: { type: string; buybackBps?: number }) {
  if (d.type === "wallet") return "Fee wallet";
  if (d.type === "holders") return "Holders";
  return `Buyback ${(d.buybackBps ?? 0) / 100}% + wallet`;
}
