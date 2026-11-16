"use client";

import { useMemo, useState } from "react";
import { formatEther, parseEther, zeroAddress } from "viem";
import { usePublicClient, useReadContract, useSimulateContract, useWriteContract } from "wagmi";
import { PROTOCOL_FEE_BPS } from "@squeez/shared";
import type { IndexedToken } from "@/lib/indexer";
import { curveTradeAbi, erc20TradeAbi, v4QuoterAbi, v4SwapRouterAbi } from "@/lib/abis";
import { bpsToPct } from "@/lib/format";
import { useProtocolConfig } from "@/lib/protocol-config";
import { useTx } from "@/providers/tx";
import { useWallet } from "@/providers/wallet";
import { WalletGateButton } from "@/components/wallet-ui";
import { Row, Segmented, inputCls } from "@/components/ui";
import { useSelectedTarget } from "@/lib/use-selected-target";
import { useCommunityCanary } from "@/lib/community-canary";
import { useDataSourceStatus } from "@/lib/indexer";

const SLIPPAGE_OPTIONS = [50, 100, 200] as const;
const DEADLINE_SECONDS = 10 * 60;

function toWei(value: string) {
  try { return value && Number(value) > 0 ? parseEther(value) : 0n; } catch { return 0n; }
}

export function OnchainTradePanel({ token, onConfirmed }: { token: IndexedToken; onConfirmed: () => void }) {
  const nativeSymbol = useSelectedTarget().info.nativeCurrency.symbol;
  const wallet = useWallet();
  const tx = useTx();
  const publicClient = usePublicClient();
  const writer = useWriteContract();
  const protocol = useProtocolConfig();
  const canary = useCommunityCanary();
  const dataSource = useDataSourceStatus();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const amountWei = useMemo(() => toWei(amount), [amount]);
  const isV4 = token.venue === "uniswap-v4";
  const isGraduating = token.status === "graduating";
  const swapRouterAddress = protocol.data?.contracts.swapRouter ?? zeroAddress;
  const v4QuoterAddress = protocol.data?.contracts.v4Quoter ?? zeroAddress;
  const squeezHookAddress = protocol.data?.contracts.squeezHook ?? zeroAddress;
  const v4LpFee = Number(protocol.data?.v4Pool.lpFeeBps ?? 0);
  const v4TickSpacing = Number(protocol.data?.v4Pool.tickSpacing ?? 0);
  const v4Configured = swapRouterAddress !== zeroAddress && v4QuoterAddress !== zeroAddress
    && squeezHookAddress !== zeroAddress && Number.isInteger(v4LpFee) && Number.isInteger(v4TickSpacing)
    && v4TickSpacing > 0;
  const poolKey = useMemo(() => ({
    currency0: zeroAddress,
    currency1: token.address,
    fee: v4LpFee,
    tickSpacing: v4TickSpacing,
    hooks: squeezHookAddress,
  }), [token.address, squeezHookAddress, v4LpFee, v4TickSpacing]);

  const buyQuote = useReadContract({
    address: token.curve, abi: curveTradeAbi, functionName: "quoteBuy", args: [amountWei],
    query: { enabled: !isV4 && !isGraduating && side === "buy" && amountWei > 0n },
  });
  const sellQuote = useReadContract({
    address: token.curve, abi: curveTradeAbi, functionName: "quoteSell", args: [amountWei],
    query: { enabled: !isV4 && !isGraduating && side === "sell" && amountWei > 0n },
  });
  const v4Quote = useSimulateContract({
    address: v4QuoterAddress, abi: v4QuoterAbi, functionName: "quoteExactInputSingle",
    args: [{ poolKey, zeroForOne: side === "buy", exactAmount: amountWei, hookData: "0x" }],
    query: { enabled: isV4 && v4Configured && amountWei > 0n },
  });
  const tokenBalance = useReadContract({
    address: token.address, abi: erc20TradeAbi, functionName: "balanceOf",
    args: wallet.address ? [wallet.address as `0x${string}`] : undefined,
    query: { enabled: Boolean(wallet.address) },
  });
  const allowance = useReadContract({
    address: token.address, abi: erc20TradeAbi, functionName: "allowance",
    args: wallet.address ? [wallet.address as `0x${string}`, isV4 ? swapRouterAddress : token.curve] : undefined,
    query: { enabled: Boolean(wallet.address) && side === "sell" },
  });

  const curveQuote = side === "buy" ? buyQuote.data : sellQuote.data;
  const v4QuoteResult = v4Quote.data?.result;
  const quote = isV4 ? v4QuoteResult : curveQuote;
  const output = quote?.[0] ?? 0n;
  const quoteFeeBase = side === "buy" ? amountWei : output;
  const protocolFee = isV4 ? quoteFeeBase * BigInt(PROTOCOL_FEE_BPS) / 10_000n : (curveQuote?.[1] ?? 0n);
  const creatorFee = isV4 ? quoteFeeBase * BigInt(token.creatorFeeBps) / 10_000n : (curveQuote?.[2] ?? 0n);
  const sniperTax = !isV4 && side === "buy" && curveQuote ? (curveQuote[3] ?? 0n) : 0n;
  const minOutput = output * BigInt(10_000 - slippageBps) / 10_000n;
  const balance = side === "buy" ? (wallet.balances[nativeSymbol] ?? 0) : Number(formatEther(tokenBalance.data ?? 0n));
  const insufficient = amountWei > 0n && Number(amount) > balance;
  const quoteError = (isV4 ? v4Quote.error : (side === "buy" ? buyQuote.error : sellQuote.error))?.message.split("\n")[0];
  const writesEnabled = protocol.data?.capability === "enabled" && dataSource.data?.writeSafe === true
    && canary.actionAllowed;

  const finalizeGraduation = () => {
    if (!writesEnabled || !publicClient || !wallet.address) return;
    const symbol = token.symbol ?? "TOKEN";
    void tx.run({
      title: `Finalize $${symbol} graduation`,
      wallet: wallet.address,
      lines: [
        { label: "Token", value: `$${symbol}` },
        { label: "From", value: "Squeez bonding curve" },
        { label: "To", value: "Uniswap v4 locked liquidity" },
      ],
      successTitle: `Migration for $${symbol} confirmed`,
      successBody: "The v4 pool address and trading route will appear after the indexer catches up.",
      onSuccess: () => {
        window.setTimeout(onConfirmed, 1500);
        window.setTimeout(onConfirmed, 5000);
        window.setTimeout(onConfirmed, 12_000);
      },
    }, async () => {
      const hash = await writer.writeContractAsync({
        address: token.curve, abi: curveTradeAbi, functionName: "graduate",
      });
      return { hash, wait: async () => { await publicClient.waitForTransactionReceipt({ hash }); } };
    });
  };

  const execute = () => {
    if (!writesEnabled || isGraduating) return;
    if (!quote || output === 0n || !publicClient || !wallet.address || (isV4 && !v4Configured)) return;
    const symbol = token.symbol ?? "TOKEN";
    void tx.run({
      title: `${side === "buy" ? "Buy" : "Sell"} $${symbol}`,
      wallet: wallet.address,
      lines: [
        { label: side === "buy" ? "Pay" : "Sell", value: `${amount} ${side === "buy" ? nativeSymbol : symbol}` },
        { label: "Quoted output", value: `${formatEther(output)} ${side === "buy" ? symbol : nativeSymbol}` },
        { label: "Minimum output", value: `${formatEther(minOutput)} ${side === "buy" ? symbol : nativeSymbol}` },
        { label: "Slippage", value: bpsToPct(slippageBps) },
      ],
      successTitle: `${side === "buy" ? "Buy" : "Sell"} confirmed on-chain`,
      successBody: "The indexed trade list will refresh after the indexer catches up.",
      onSuccess: () => {
        setAmount("");
        void tokenBalance.refetch();
        window.setTimeout(onConfirmed, 1500);
        window.setTimeout(onConfirmed, 5000);
      },
    }, async () => {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
      if (isV4) {
        if (side === "sell" && (allowance.data ?? 0n) < amountWei) {
          const approvalHash = await writer.writeContractAsync({
            address: token.address, abi: erc20TradeAbi, functionName: "approve", args: [swapRouterAddress, amountWei],
          });
          await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        }
        const hash = await writer.writeContractAsync({
          address: swapRouterAddress, abi: v4SwapRouterAbi, functionName: "swapExactInput",
          args: [poolKey, side === "buy", amountWei, minOutput, wallet.address as `0x${string}`, deadline],
          value: side === "buy" ? amountWei : 0n,
        });
        return { hash, wait: async () => { await publicClient.waitForTransactionReceipt({ hash }); } };
      }
      if (side === "buy") {
        const hash = await writer.writeContractAsync({
          address: token.curve, abi: curveTradeAbi, functionName: "buy",
          args: [minOutput, deadline], value: amountWei,
        });
        return { hash, wait: async () => { await publicClient.waitForTransactionReceipt({ hash }); } };
      }

      if ((allowance.data ?? 0n) < amountWei) {
        const approvalHash = await writer.writeContractAsync({
          address: token.address, abi: erc20TradeAbi, functionName: "approve", args: [token.curve, amountWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }
      const hash = await writer.writeContractAsync({
        address: token.curve, abi: curveTradeAbi, functionName: "sell",
        args: [amountWei, minOutput, deadline],
      });
      return { hash, wait: async () => { await publicClient.waitForTransactionReceipt({ hash }); } };
    });
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
        {(["buy", "sell"] as const).map((value) => (
          <button key={value} type="button" onClick={() => { setSide(value); setAmount(""); }}
            className={`rounded-md py-2 text-sm font-semibold capitalize ${side === value ? "bg-white text-bg" : "text-muted hover:text-white"}`}>
            {value}
          </button>
        ))}
      </div>

      {isGraduating && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-3">
          <p className="text-sm font-medium text-white">Bonding complete · v4 migration pending</p>
          <p className="mt-1 text-xs text-muted">The curve is closed. Graduation is permissionless; any connected wallet can finalize the locked Uniswap v4 pool.</p>
          <WalletGateButton className="mt-3 w-full" disabled={!writesEnabled} onClick={finalizeGraduation}>
            Finalize migration to v4
          </WalletGateButton>
        </div>
      )}

      <div className={`mt-4 flex items-center justify-between text-xs text-muted ${isGraduating ? "opacity-50" : ""}`}>
        <span>{side === "buy" ? `Pay with ${nativeSymbol}` : `Sell $${token.symbol ?? "TOKEN"}`}</span>
        {wallet.status === "connected" && <button type="button" onClick={() => setAmount(String(balance))}>Balance {balance.toFixed(6)}</button>}
      </div>
      <input className={`${inputCls} num mt-1 h-12 text-lg`} type="number" min="0" inputMode="decimal"
        placeholder="0.0" value={amount} disabled={isGraduating} onChange={(event) => setAmount(event.target.value)} />

      <div className="mt-3">
        <div className="mb-1 text-xs text-muted">Slippage protection</div>
        <Segmented size="sm" value={String(slippageBps)} onChange={(value) => setSlippageBps(Number(value))}
          options={SLIPPAGE_OPTIONS.map((value) => ({ id: String(value), label: bpsToPct(value) }))} />
      </div>

      <div className="mt-4 rounded-lg bg-bg p-3 text-xs">
        <Row label="On-chain quote" value={quote ? `${formatEther(output)} ${side === "buy" ? token.symbol ?? "TOKEN" : nativeSymbol}` : "—"} />
        <Row label={`Protocol fee${isV4 ? " (estimated)" : ""}`} value={quote ? `${formatEther(protocolFee)} ${nativeSymbol}` : "—"} />
        <Row label={`Creator fee (${bpsToPct(token.creatorFeeBps)})${isV4 ? " · estimated" : ""}`} value={quote ? `${formatEther(creatorFee)} ${nativeSymbol}` : "—"} />
        {sniperTax > 0n && <Row label="Sniper tax" value={`${formatEther(sniperTax)} ${nativeSymbol}`} />}
        <Row label="Deadline" value="10 minutes" />
      </div>

      {quoteError && <p className="mt-3 text-xs text-down">Unable to quote this trade: {quoteError}</p>}
      {isV4 && !v4Configured && <p className="mt-3 text-xs text-down">The API has not published the v4 route configuration.</p>}
      {insufficient && <p className="mt-3 text-xs text-down">Insufficient wallet balance.</p>}
      <WalletGateButton className="mt-4 w-full" variant={side === "buy" ? "primary" : "sell"}
        disabled={isGraduating || !quote || output === 0n || insufficient || Boolean(quoteError) || (isV4 && !v4Configured)
          || !writesEnabled} onClick={execute}>
        {isGraduating ? "Trading resumes on v4 after migration" : !amountWei ? "Enter an amount" : `${side === "buy" ? "Buy" : "Sell"} ${token.symbol ?? "token"}`}
      </WalletGateButton>
      <p className="mt-2 text-center text-[11px] text-muted">
        {isV4 ? "Quote comes from the v4 Quoter; settlement uses the graduated Uniswap v4 pool." : isGraduating ? "Buy and sell remain visible while the permissionless v4 migration is finalized." : "Quote and settlement come directly from the deployed curve contract."}
      </p>
    </section>
  );
}
