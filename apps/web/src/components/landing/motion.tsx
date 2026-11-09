"use client";
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* Loader: full-screen counter 000 → 100, then the panel wipes upward. */
/* Shown once per browser session.                                     */
/* ------------------------------------------------------------------ */
export function Loader({ label }: { label: string }) {
  const [n, setN] = useState(0);
  const [phase, setPhase] = useState<"count" | "out" | "gone">("count");
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("squeez.loaded") === "1"; } catch {}
    if (seen || reduced()) { setPhase("gone"); document.documentElement.classList.add("loaded"); return; }
    const start = performance.now(), dur = 1500;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      // stepped easing: jumps like a real progress readout
      setN(Math.min(100, Math.round(100 * (1 - Math.pow(1 - k, 2.4)) / 3) * 3 + (k === 1 ? 1 : 0)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        setN(100);
        setTimeout(() => { setPhase("out"); document.documentElement.classList.add("loaded"); }, 180);
        setTimeout(() => setPhase("gone"), 1100);
        try { sessionStorage.setItem("squeez.loaded", "1"); } catch {}
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (phase === "gone") return null;
  return (
    <div aria-hidden className={`loader ${phase === "out" ? "loader-out" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="num text-[11px] uppercase tracking-[0.14em] text-muted">[ {label} ]</span>
        <span className="num text-[11px] text-muted">{String(n).padStart(3, "0")}/100</span>
      </div>
      <div className="mt-auto h-px w-full bg-line"><div className="h-px bg-white" style={{ width: `${n}%` }} /></div>
      <div className="wordmark font-display font-extrabold text-white" style={{ fontSize: "clamp(6rem, 30vw, 26rem)" }}>{String(n).padStart(3, "0")}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal: adds .in to [data-reveal] elements when they scroll into view */
/* ------------------------------------------------------------------ */
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduced() || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        els.filter((el) => el === e.target || (el.dataset.reveal === "line" && el.parentElement === e.target)).forEach((el) => el.classList.add("in"));
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    const target = new Map<Element, HTMLElement>();
    els.forEach((e) => { const t = e.dataset.reveal === "line" && e.parentElement ? e.parentElement : e; target.set(t, e); io.observe(t); });
    return () => io.disconnect();
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */
/* Negative mode: inverts the whole page. Toggle with the button or N. */
/* ------------------------------------------------------------------ */
export function NegativeToggle({ on, off }: { on: string; off: string }) {
  const [neg, setNeg] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) setNeg((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("negative", neg); }, [neg]);
  return (
    <button type="button" onClick={() => setNeg((v) => !v)} aria-pressed={neg} className="ulink hover:text-white">
      {neg ? off : on} <span className="num text-muted">[N]</span>
    </button>
  );
}

/* Shared: run a draw loop only while the canvas is on screen. */
function useVisibleLoop(ref: React.RefObject<HTMLCanvasElement>, step: (t: number) => void, deps: unknown[] = []) {
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0, visible = false;
    const loop = (t: number) => { step(t); if (visible) raf = requestAnimationFrame(loop); };
    const io = new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was) raf = requestAnimationFrame(loop);
    });
    io.observe(c);
    if (reduced()) step(0); // one still frame
    return () => { io.disconnect(); cancelAnimationFrame(raf); visible = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* 8×8 Bayer matrix, normalised to 0..1 thresholds */
const BAYER = (() => {
  const m = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  return Float32Array.from(m, (v) => (v + 0.5) / 64);
})();

/* ------------------------------------------------------------------ */
/* DitherCurve: 1-bit ordered-dither rendering of the bonding curve as  */
/* a lit, rippling surface. Follows the pointer. Original Squeez asset. */
/* ------------------------------------------------------------------ */
export function DitherCurve({ className = "", cell = 3 }: { className?: string; cell?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ptr = useRef({ x: 0.7, y: 0.4, tx: 0.7, ty: 0.4 });
  const buf = useRef<{ w: number; h: number; img: ImageData | null; ctx: CanvasRenderingContext2D | null }>({ w: 0, h: 0, img: null, ctx: null });

  useEffect(() => {
    const c = ref.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const w = Math.max(40, Math.round(r.width / cell)), h = Math.max(30, Math.round(r.height / cell));
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      buf.current = { w, h, ctx, img: ctx.createImageData(w, h) };
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(c);
    const move = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      ptr.current.tx = (e.clientX - r.left) / r.width; ptr.current.ty = (e.clientY - r.top) / r.height;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener("pointermove", move); };
  }, [cell]);

  useVisibleLoop(ref, (t) => {
    const { w, h, img, ctx } = buf.current;
    if (!img || !ctx) return;
    const p = ptr.current; p.x += (p.tx - p.x) * 0.06; p.y += (p.ty - p.y) * 0.06;
    const time = t * 0.00045, d = img.data;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) {
        const u = x / w;
        // bonding curve y = ((0.4+u*1)/1.4)^2 mapped into the frame, with a travelling ripple
        const curve = 0.92 - 0.78 * Math.pow((0.4 + u) / 1.4, 2) + 0.018 * Math.sin(u * 14 - time * 6);
        const dist = v - curve;                          // >0: below the curve (filled area)
        const edge = Math.exp(-Math.pow(dist * 34, 2)); // bright rim along the curve
        const fill = dist > 0 ? 0.08 + 0.55 * Math.exp(-dist * 4) * (0.55 + 0.45 * Math.sin(u * 22 + v * 10 - time * 3)) : 0;
        const dx = u - p.x, dy = (v - p.y) * (h / w);
        const light = Math.exp(-(dx * dx + dy * dy) * 14);
        const lum = Math.min(1, edge + fill * (0.6 + light) + light * (dist > 0 ? 0.25 : 0.1));
        const on = lum > BAYER[(y & 7) * 8 + (x & 7)] ? 245 : 5;
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = on; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [cell]);

  return <canvas ref={ref} aria-hidden className={`pixelated block h-full w-full ${className}`} />;
}

/* ------------------------------------------------------------------ */
/* ReactionField: Gray-Scott reaction-diffusion, seeded with the letters */
/* of a word, rendered 1-bit. Click to drop new seeds.                  */
/* ------------------------------------------------------------------ */
export function ReactionField({ word = "SQZ", className = "", cell = 4 }: { word?: string; className?: string; cell?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sim = useRef<{ w: number; h: number; a: Float32Array; b: Float32Array; a2: Float32Array; b2: Float32Array; ctx: CanvasRenderingContext2D; img: ImageData } | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const w = Math.max(60, Math.min(260, Math.round(r.width / cell))), h = Math.max(40, Math.min(160, Math.round(r.height / cell)));
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    const a = new Float32Array(w * h).fill(1), b = new Float32Array(w * h);
    // seed: render the word into an offscreen canvas and use it as the B chemical
    const o = document.createElement("canvas"); o.width = w; o.height = h;
    const oc = o.getContext("2d")!;
    oc.fillStyle = "#fff"; oc.font = `900 ${Math.round(h * 0.62)}px sans-serif`; oc.textAlign = "center"; oc.textBaseline = "middle";
    oc.fillText(word, w / 2, h / 2);
    const px = oc.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) if (px[i * 4] > 128) { a[i] = 0.5; b[i] = 0.25 + Math.random() * 0.1; }
    sim.current = { w, h, a, b, a2: new Float32Array(w * h), b2: new Float32Array(w * h), ctx, img: ctx.createImageData(w, h) };
    const drop = (e: PointerEvent) => {
      const s = sim.current!; const rr = c.getBoundingClientRect();
      const cx = Math.round(((e.clientX - rr.left) / rr.width) * s.w), cy = Math.round(((e.clientY - rr.top) / rr.height) * s.h);
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        const X = cx + x, Y = cy + y; if (X >= 0 && Y >= 0 && X < s.w && Y < s.h) { s.a[Y * s.w + X] = 0.5; s.b[Y * s.w + X] = 0.25; }
      }
    };
    c.addEventListener("pointerdown", drop);
    return () => c.removeEventListener("pointerdown", drop);
  }, [word, cell]);

  useVisibleLoop(ref, () => {
    const s = sim.current; if (!s) return;
    const { w, h } = s, F = 0.0545, K = 0.062, DA = 1, DB = 0.5;
    for (let it = 0; it < 8; it++) {
      const { a, b, a2, b2 } = s;
      for (let y = 0; y < h; y++) {
        const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const xm = (x - 1 + w) % w, xp = (x + 1) % w, i = y0 + x;
          const la = a[ym + x] + a[yp + x] + a[y0 + xm] + a[y0 + xp] - 4 * a[i];
          const lb = b[ym + x] + b[yp + x] + b[y0 + xm] + b[y0 + xp] - 4 * b[i];
          const abb = a[i] * b[i] * b[i];
          a2[i] = Math.min(1, Math.max(0, a[i] + DA * 0.2 * la - abb + F * (1 - a[i])));
          b2[i] = Math.min(1, Math.max(0, b[i] + DB * 0.2 * lb + abb - (K + F) * b[i]));
        }
      }
      s.a = a2; s.a2 = a; s.b = b2; s.b2 = b;
    }
    const d = s.img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, v = Math.min(1, Math.max(0, (s.b[i] * 3.2)));
      const on = v > BAYER[(y & 7) * 8 + (x & 7)] ? 240 : 8;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = on; d[i * 4 + 3] = 255;
    }
    s.ctx.putImageData(s.img, 0, 0);
  }, [word, cell]);

  return <canvas ref={ref} aria-hidden className={`pixelated block h-full w-full cursor-crosshair ${className}`} />;
}
