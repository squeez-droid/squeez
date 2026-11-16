import { NextResponse } from "next/server";

type HyperliquidMids = Record<string, string>;

export async function GET() {
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ type: "allMids" }),
      next: { revalidate: 60 },
    });
    if (!response.ok) throw new Error(`Price provider returned ${response.status}`);
    const payload = await response.json() as HyperliquidMids;
    const eth = Number(payload.ETH);
    const hype = Number(payload.HYPE);
    return NextResponse.json({
      ETH: Number.isFinite(eth) && eth > 0 ? eth : null,
      HYPE: Number.isFinite(hype) && hype > 0 ? hype : null,
      updatedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    // USD is presentational reference data. On-chain token values remain available when the
    // external price provider is temporarily unavailable; never substitute a made-up price.
    return NextResponse.json({ ETH: null, HYPE: null, updatedAt: null }, {
      headers: { "cache-control": "public, max-age=10, s-maxage=10" },
    });
  }
}
