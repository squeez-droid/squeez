"use client";
import { useEffect, useMemo, useRef } from "react";
import { createChart, ColorType, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/types";

export type Timeframe = "5m" | "15m" | "1h";
const TF_SEC: Record<Timeframe, number> = { "5m": 300, "15m": 900, "1h": 3600 };

function aggregate(c: Candle[], tf: Timeframe): Candle[] {
  const step = TF_SEC[tf];
  const out: Candle[] = [];
  for (const k of c) {
    const t = Math.floor(k.time / step) * step;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, k.high);
      last.low = Math.min(last.low, k.low);
      last.close = k.close;
      last.volumeHype += k.volumeHype;
    } else out.push({ ...k, time: t });
  }
  return out;
}

export function PriceChart({ candles, tf, multiplier, height = 360 }: { candles: Candle[]; tf: Timeframe; multiplier: number; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const data = useMemo(() => aggregate(candles, tf), [candles, tf]);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8C8C8C", fontFamily: "var(--font-mono)" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1A1A1A" } },
      rightPriceScale: { borderColor: "#262626" },
      timeScale: { borderColor: "#262626", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0, vertLine: { color: "#8C8C8C", labelBackgroundColor: "#262626" }, horzLine: { color: "#8C8C8C", labelBackgroundColor: "#262626" } },
      localization: { priceFormatter: (p: number) => (Math.abs(p) < 1e-15 ? "0" : p >= 1 ? p.toFixed(4) : p.toPrecision(4)) },
      autoSize: true,
    });
    chart.current = c;
    const s = c.addCandlestickSeries({ upColor: "#FAFAFA", downColor: "#000000", borderVisible: true, borderUpColor: "#FAFAFA", borderDownColor: "#8C8C8C", wickUpColor: "#FAFAFA", wickDownColor: "#8C8C8C", priceFormat: { type: "custom", minMove: 1e-12, formatter: (p: number) => (Math.abs(p) < 1e-15 ? "0" : p >= 1 ? p.toFixed(4) : p.toPrecision(4)) } });
    s.setData(data.map((d) => ({ time: d.time as UTCTimestamp, open: d.open * multiplier, high: d.high * multiplier, low: d.low * multiplier, close: d.close * multiplier })));
    const v = c.addHistogramSeries({ priceScaleId: "", priceFormat: { type: "volume" }, color: "#26262680", lastValueVisible: false, priceLineVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    v.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.volumeHype, color: d.close >= d.open ? "#FAFAFA33" : "#8C8C8C33" })));
    c.timeScale().fitContent();
    return () => { c.remove(); chart.current = null; };
  }, [data, multiplier, height]);

  return <div ref={el} className="w-full" style={{ height }} />;
}
