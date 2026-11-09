"use client";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { config, getQuote, NOW } from "@/lib/data";
import { SUPPLY, THRESHOLD, quoteBuy, quotePool, quoteSell, sniperTaxBps } from "@/lib/curve";
import { bpsToPct, fmtNum, fmtPrice } from "@/lib/format";
import { HYPE_USD } from "@/lib/market";
import type { Token } from "@/lib/types";
import { useWallet } from "@/providers/wallet";
import { useTx } from "@/providers/tx";
import { Row, Segmented, inputCls } from "../ui";
import { WalletGateButton } from "../wallet-ui";
import { IconGrad, IconSliders } from "../icons";

export interface LiveState { status: Token["status"]; hypeRaised: number; priceHype: number; holding: number }

export function TradePanel({ token, live, onTrade }: { token: Token; live: LiveState; onTrade: (d: { side: "buy" | "sell"; hype: number; tokens: number; graduates: boolean }) => void }) {
  const w = useWallet();
  const tx = useTx();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState<number>(config.defaultSlippageBps);
  const [showSlip, setShowSlip] = useState(false);
  const quote = getQuote(token.quote);
  const grad = live.status === "graduated";
  // after graduation: pay with the quote asset, or HYPE/USDC via the router
  const payOptions = grad ? Array.from(new Set([quote.symbol, "HYPE", "USDC"])) : ["HYPE"];
  const [pay, setPay] = useState(payOptions[0]);
  const payQuote = getQuote(pay);

  const secondsSinceLaunch = (NOW - Date.parse(token.createdAt)) / 1000;
  const tax = grad ? 0 : sniperTaxBps(secondsSinceLaunch);
  const maxWalletActive = !grad && secondsSinceLaunch < config.launchConfig.maxWallet.windowSeconds;
  const maxWalletTokens = (SUPPLY * config.launchConfig.maxWallet.bps) / 10000;

  const amt = parseFloat(amount) || 0;
  // convert input to HYPE-equivalent for the math
  const amtHype = side === "buy" ? (amt * payQuote.usd) / HYPE_USD : amt;

  const q = useMemo(() => {
    if (amt <= 0) return null;
    if (!grad) return side === "buy" ? quoteBuy(live.hypeRaised, amtHype, token.creatorFeeBps, tax) : quoteSell(live.hypeRaised, amt, token.creatorFeeBps);
    const lp = token.lpLocked?.tokenAmount ?? 204081633;
    return quotePool(live.priceHype, lp, side === "buy" ? amtHype : amt, side, token.creatorFeeBps);
  }, [amt, amtHype, grad, side, live.hypeRaised, live.priceHype, token, tax]);

  const balance = side === "buy" ? (w.balances[pay] ?? 0) : live.holding;
  const insufficient = w.status === "connected" && amt > balance;
  const exceedsMaxWallet = maxWalletActive && side === "buy" && q && live.holding + q.outAmount > maxWalletTokens;
  const minOut = q ? q.outAmount * (1 - slip / 10000) : 0;

  // output in the displayed unit
  const outUnit = side === "buy" ? token.ticker : grad ? quote.symbol : "HYPE";
  const outValue = q ? (side === "sell" && grad ? (q.outAmount * HYPE_USD) / quote.usd : q.outAmount) : 0;
  const feeUnit = grad ? quote.symbol : "HYPE";
  const feeConv = (v: number) => (grad ? (v * HYPE_USD) / quote.usd : v);

  const presets = side === "buy" ? (pay === "HYPE" ? ["1", "5", "10", "25"] : ["10", "50", "100", "500"]) : ["25%", "50%", "75%", "100%"];

  const execute = () => {
    if (!q) return;
    const hypeMoved = side === "buy" ? q.effectiveHypeIn : q.outAmount + q.totalFee;
    tx.run({
      title: `${side === "buy" ? "Buy" : "Sell"} $${token.ticker}`,
      lines: [
        { label: side === "buy" ? "Pay" : "Sell", value: `${fmtNum(side === "buy" ? amt - (q.refundHype * HYPE_USD) / payQuote.usd : amt, 4)} ${side === "buy" ? pay : token.ticker}` },
        { label: "Receive (est.)", value: `${fmtNum(outValue, 4)} ${outUnit}` },
        { label: "Venue", value: grad ? `Uniswap v4 + Squeez hook${pay !== quote.symbol && side === "buy" ? ` (route ${pay}→${quote.symbol})` : ""}` : "SqueezCurve" },
        ...(q.graduates ? [{ label: "Graduation", value: `Yes · refund ${fmtNum(q.refundHype, 4)} HYPE` }] : []),
      ],
      successTitle: q.graduates ? `$${token.ticker} graduated to Uniswap v4` : `${side === "buy" ? "Buy" : "Sell"} $${token.ticker} confirmed`,
      successBody: q.graduates ? "Curve locked, v4 pool created and LP locked forever. The token page switches to pool mode." : undefined,
      onSuccess: () => { onTrade({ side, hype: hypeMoved, tokens: side === "buy" ? q.outAmount : amt, graduates: q.graduates }); setAmount(""); },
    });
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); setAmount(""); }} className={clsx("rounded-md py-2 text-sm font-semibold capitalize transition", side === s ? (s === "buy" ? "bg-white text-bg" : "bg-surface2 text-white ring-1 ring-inset ring-white") : "text-muted hover:text-white")}>{s}</button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{grad ? "Uniswap v4 pool" : "Bonding curve"} · {grad ? `${token.ticker}/${quote.symbol}` : "HYPE"}</span>
        <button onClick={() => setShowSlip((v) => !v)} className="hover:text-white"><span className="inline-flex items-center gap-1">Slippage {bpsToPct(slip)} <IconSliders width={13} height={13} /></span></button>
      </div>
      {showSlip && (
        <div className="mt-2"><Segmented size="sm" options={config.slippageOptionsBps.map((b) => ({ id: String(b), label: bpsToPct(b) }))} value={String(slip)} onChange={(v) => { setSlip(+v); setShowSlip(false); }} /></div>
      )}

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted">{side === "buy" ? "You pay" : "You sell"}</span>
          {w.status === "connected" && <button className="num text-muted hover:text-white" onClick={() => setAmount(String(+balance.toFixed(6)))}>Balance {fmtNum(balance, 4)}</button>}
        </div>
        <div className="relative">
          <input type="number" min={0} inputMode="decimal" className={clsx(inputCls, "num h-12 pr-28 text-lg")} placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {side === "buy" && payOptions.length > 1 ? (
              <select value={pay} onChange={(e) => { setPay(e.target.value); setAmount(""); }} className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-white outline-none">
                {payOptions.map((p) => <option key={p}>{p}</option>)}
              </select>
            ) : <span className="px-2 text-sm text-muted">{side === "buy" ? "HYPE" : token.ticker}</span>}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {presets.map((p) => (
            <button key={p} onClick={() => setAmount(p.endsWith("%") ? String(+(live.holding * parseInt(p) / 100).toFixed(0)) : p)} className="num rounded-md border border-line py-1 text-xs text-muted hover:border-white/60 hover:text-white">{p}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-bg p-3">
        <div className="flex items-end justify-between">
          <span className="text-xs text-muted">You receive (est.)</span>
          <span className="num text-lg font-semibold text-white">{fmtNum(outValue, side === "buy" ? 0 : 4)} <span className="text-sm text-muted">{outUnit}</span></span>
        </div>
        {q && (
          <div className="mt-2 border-t border-line pt-2 text-xs">
            <Row className="text-xs" label="Protocol fee (1%)" value={`${fmtPrice(feeConv(q.protocolFee))} ${feeUnit}`} />
            <Row className="text-xs" label={`Creator fee (${bpsToPct(token.creatorFeeBps)})`} value={`${fmtPrice(feeConv(q.creatorFee))} ${feeUnit}`} />
            {q.sniperTax > 0 && <Row className="text-xs text-warn" label={`Sniper tax (${bpsToPct(tax)})`} value={`${fmtPrice(q.sniperTax)} HYPE`} />}
            <Row className="text-xs" label="Price impact" value={<span className={q.priceImpactPct > 5 ? "text-warn" : ""}>{q.priceImpactPct.toFixed(2)}%</span>} />
            <Row className="text-xs" label={`Min. received (${bpsToPct(slip)})`} value={`${fmtNum(side === "sell" && grad ? (minOut * HYPE_USD) / quote.usd : minOut, side === "buy" ? 0 : 4)} ${outUnit}`} />
            {grad && side === "buy" && pay !== quote.symbol && <Row className="text-xs" label="Route" value={`${pay} → ${quote.symbol} → ${token.ticker}`} />}
          </div>
        )}
      </div>

      {q?.graduates && (
        <div className="mt-3 flex gap-2 rounded-md border border-white p-3 text-xs text-white">
          <IconGrad className="mt-px shrink-0" width={16} height={16} /><span>This buy fills the curve and triggers graduation to Uniswap v4. The excess {fmtNum(q.refundHype, 4)} HYPE is refunded to you.</span>
        </div>
      )}
      {tax > 0 && <p className="mt-3 border-l-2 border-white pl-3 text-xs text-white">Sniper tax active: {bpsToPct(tax)} (decays to 0% within {config.launchConfig.sniperTax.decaySeconds} seconds of launch).</p>}
      {exceedsMaxWallet && <p className="mt-3 border-l-2 border-down pl-3 text-xs text-down">Exceeds the {config.launchConfig.maxWallet.bps / 100}% max wallet during the early window.</p>}
      {maxWalletActive && !exceedsMaxWallet && <p className="mt-3 text-xs text-muted">Max wallet {config.launchConfig.maxWallet.bps / 100}% active for another {Math.ceil((config.launchConfig.maxWallet.windowSeconds - secondsSinceLaunch) / 60)} min.</p>}

      <WalletGateButton className="mt-3 w-full" variant={side === "buy" ? "primary" : "sell"} disabled={!q || insufficient || !!exceedsMaxWallet || (side === "sell" && live.holding <= 0)} onClick={execute}>
        {insufficient ? "Insufficient balance" : side === "sell" && live.holding <= 0 ? `No ${token.ticker} to sell` : !q ? "Enter an amount" : q.graduates ? "Buy & graduate" : `${side === "buy" ? "Buy" : "Sell"} ${token.ticker}`}
      </WalletGateButton>
      {!grad && <p className="mt-2 text-center text-[11px] text-muted">Graduates at {THRESHOLD} HYPE. All curve prices are in HYPE.</p>}
    </div>
  );
}
