"use client";
import { useEffect, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Live UTC clock. Renders a fixed-width placeholder until mounted so server and client markup match. */
export function ChainClock({ seconds = true }: { seconds?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  const text = now ? `${p(now.getUTCHours())}:${p(now.getUTCMinutes())}${seconds ? `:${p(now.getUTCSeconds())}` : ""}` : seconds ? "--:--:--" : "--:--";
  return <time className="num" suppressHydrationWarning>{text}</time>;
}

/** Three-digit counter that runs 000 → target once on load (the page's "loading" mark). */
export function Counter({ to = 100, from = "000" }: { to?: number; from?: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (reduced()) { setN(to); return; }
    const start = performance.now(), dur = 1400;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span className="num" aria-hidden>{n === null ? from : String(n).padStart(3, "0")}</span>;
}
