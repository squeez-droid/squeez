"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/chain";
import { getQuote } from "@/lib/data";
import { getIndexedMetadata, type IndexedToken } from "@/lib/indexer";
import type { Token } from "@/lib/types";

/** Token image from IPFS when present; otherwise a ticker monogram (monochrome, deterministic). */
export function TokenAvatar({ token, size = 40, className }: { token: Pick<Token, "image" | "ticker">; size?: number; className?: string }) {
  if (token.image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={token.image} alt="" width={size} height={size} className={clsx("shrink-0 rounded-md object-cover", className)} style={{ width: size, height: size }} />;
  const t = (token.ticker || "?").slice(0, 2);
  // line pattern differs per ticker so cards are not identical
  const seed = [...token.ticker].reduce((a, c) => a + c.charCodeAt(0), 0);
  const angle = [0, 45, 90, 135][seed % 4];
  return (
    <div aria-hidden className={clsx("relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface2 font-display font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.34 }}>
      <span className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: `repeating-linear-gradient(${angle}deg, currentColor 0 1px, transparent 1px ${4 + (seed % 4)}px)` }} />
      <span className="relative tracking-tight">{t}</span>
    </div>
  );
}

/** Resolve the image from the IPFS metadata URI indexed from the launch event. */
export function IndexedTokenAvatar({ token, targetApiUrl, size = 40, className }: {
  token: Pick<IndexedToken, "address" | "symbol">;
  targetApiUrl: string;
  size?: number;
  className?: string;
}) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setImage(null);
    getIndexedMetadata(token.address, controller.signal, targetApiUrl)
      .then((metadata) => setImage(metadata?.imagePath ? `${apiUrl}${metadata.imagePath}` : null))
      .catch(() => setImage(null));
    return () => controller.abort();
  }, [targetApiUrl, token.address]);

  return <TokenAvatar token={{ image, ticker: token.symbol ?? "?" }} size={size} className={className} />;
}

export function PairBadge({ quote, className }: { quote: string; className?: string }) {
  const q = getQuote(quote);
  return (
    <span className={clsx("num inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-px text-[11px] text-white/90", className)}>
      /{q.symbol}
      {q.category === "stock" && <span className="text-muted">stock</span>}
    </span>
  );
}

export function QuoteDot({ symbol, size = 18 }: { symbol: string; size?: number }) {
  const q = getQuote(symbol);
  return (
    <span aria-hidden className="num inline-flex shrink-0 items-center justify-center rounded-sm border border-white/80 text-[10px] font-semibold text-white" style={{ width: size, height: size }}>
      {q.symbol.slice(0, 1)}
    </span>
  );
}
