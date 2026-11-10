"use client";
import { useEffect, useMemo, useState } from "react";
import { MAX_CREATOR_FEE_BPS, TOTAL_SUPPLY } from "@squeez/shared";
import { formatEther, parseEther } from "viem";
import { useReadContract, useSignMessage } from "wagmi";
import { content, tokens } from "@/lib/data";
import { launchFactoryAbi } from "@/lib/abis";
import { apiUrl } from "@/lib/chain";
import { fill, isAddress } from "@/lib/format";
import { useProtocolConfig } from "@/lib/protocol-config";
import type { QuotePair } from "@/lib/types";
import { useWallet } from "@/providers/wallet";

export type PairGroup = "hype" | "crypto" | "stock";
export type Destination = "wallet" | "buyback" | "holders";

export interface LaunchForm {
  name: string;
  ticker: string;
  image: string | null;
  metadataURI: string | null;
  description: string;
  x: string;
  telegram: string;
  website: string;
  group: PairGroup;
  quote: string;
  feeWallet: string;
  creatorFeeBps: number;
  destWallet: boolean;
  destBuyback: boolean;
  destHolders: boolean;
  buybackBps: number;
  openingBuy: string;
}

export type FormErrors = Partial<Record<string, string>>;

const INITIAL: LaunchForm = {
  name: "", ticker: "", image: null, metadataURI: null, description: "", x: "", telegram: "", website: "",
  group: "hype", quote: "HYPE", feeWallet: "", creatorFeeBps: 100,
  destWallet: true, destBuyback: false, destHolders: false, buybackBps: 5000, openingBuy: "",
};

const E = content.launch.errors;
const nativeHypePair: QuotePair = {
  symbol: "HYPE", name: "Native HYPE", category: "crypto", source: "SqueezQuoteRegistry",
  status: "ready", enabled: true, decimals: 18, usd: 0, color: "#50E3C2",
  address: "0x0000000000000000000000000000000000000000",
};

/** Quote pairs shown for a pair group in the Economics step. */
export function pairsForGroup(group: PairGroup): QuotePair[] {
  return group === "hype" ? [nativeHypePair] : [];
}

function validateIdentity(f: LaunchForm): FormErrors {
  const e: FormErrors = {};
  if (f.name.trim().length < 2) e.name = E.nameShort;
  if (f.name.length > 32) e.name = E.nameLong;
  if (!/^[A-Z0-9]{2,10}$/.test(f.ticker)) e.ticker = E.ticker;
  else if (tokens.some((t) => t.ticker === f.ticker)) e.ticker = E.tickerTaken;
  if (!f.image) e.image = E.image;
  if (f.description.length > 280) e.description = E.description;
  if (f.website && !/^https?:\/\//.test(f.website)) e.website = E.website;
  return e;
}

/** Form state, validation and derived numbers for the launch wizard. */
export function useLaunchForm() {
  const wallet = useWallet();
  const signer = useSignMessage();
  const protocol = useProtocolConfig();
  const [form, setForm] = useState<LaunchForm>(INITIAL);
  const [metadataUploading, setMetadataUploading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const set = <K extends keyof LaunchForm>(key: K, value: LaunchForm[K]) => setForm((s) => ({
    ...s,
    [key]: value,
    ...(["name", "ticker", "image", "description", "x", "telegram", "website"].includes(key) ? { metadataURI: null } : {}),
  }));
  const patch = (p: Partial<LaunchForm>) => setForm((s) => ({ ...s, ...p }));

  // Default fee wallet = launching wallet.
  useEffect(() => {
    if (wallet.address && !form.feeWallet) set("feeWallet", wallet.address);
  }, [wallet.address, form.feeWallet]);

  const opening = parseFloat(form.openingBuy) || 0;
  let openingWei = 0n;
  try { openingWei = parseEther(form.openingBuy || "0"); } catch { /* validation reports malformed values */ }
  const factory = protocol.data?.contracts.factory ?? undefined;
  const openingRead = useReadContract({
    address: factory,
    abi: launchFactoryAbi,
    functionName: "quoteOpeningBuy",
    args: [openingWei, form.creatorFeeBps],
    query: { enabled: Boolean(factory && openingWei > 0n) },
  });
  const tokensOut = openingRead.data?.[0] ?? 0n;
  const openingQuote = { outAmount: Number(formatEther(tokensOut)) };
  const openingPct = openingQuote.outAmount / TOTAL_SUPPLY * 100;
  const launchFeeHype = Number(protocol.data?.launchConfig.launchFeeHype ?? 0);
  const maxWalletPct = Number(protocol.data?.launchConfig.maxWalletBps ?? 0) / 100;

  const identityErrors = useMemo(() => validateIdentity(form), [form]);

  const economicsErrors = useMemo(() => {
    const e: FormErrors = {};
    if (!isAddress(form.feeWallet)) e.feeWallet = E.feeWallet;
    if (form.creatorFeeBps < 0 || form.creatorFeeBps > MAX_CREATOR_FEE_BPS) e.fee = E.fee;
    if (!form.destWallet && !form.destBuyback && !form.destHolders) e.dest = E.dest;
    if (form.destBuyback || form.destHolders) e.dest = "Only direct fee-wallet payouts are enabled for the HYPE v1 release.";
    if (opening < 0) e.opening = E.openingNegative;
    if (maxWalletPct > 0 && openingPct > maxWalletPct) e.opening = fill(E.openingMaxWallet, { pct: maxWalletPct });
    if (wallet.status === "connected" && opening + launchFeeHype > (wallet.balances.HYPE ?? 0)) e.opening = E.openingBalance;
    if (openingWei > 0n && openingRead.isError) e.opening = "Unable to quote the opening buy on-chain.";
    return e;
  }, [form, opening, openingPct, maxWalletPct, launchFeeHype, openingWei, openingRead.isError, wallet.status, wallet.balances.HYPE]);

  const selectGroup = (group: PairGroup) => {
    const first = pairsForGroup(group)[0];
    if (first) patch({ group, quote: first.symbol });
  };

  /** Toggle wallet/buyback. Holders is exclusive and needs a confirmation, see `enableHolders`. */
  const toggleDestination = (d: Exclude<Destination, "holders">) =>
    setForm((s) => ({
      ...s,
      destHolders: false,
      ...(d === "wallet" ? { destWallet: !s.destWallet } : { destBuyback: !s.destBuyback }),
    }));
  const enableHolders = () => patch({ destHolders: true, destWallet: false, destBuyback: false });
  const disableHolders = () => patch({ destHolders: false, destWallet: true });

  const L = content.launch.destLabels;
  const destinationLabel = form.destHolders
    ? L.holders
    : [form.destWallet && L.wallet, form.destBuyback && fill(L.buyback, { pct: form.buybackBps / 100 })].filter(Boolean).join(" + ");

  const uploadMetadata = async (requestId: string): Promise<string> => {
    if (form.metadataURI) return form.metadataURI;
    if (!wallet.address || !form.image) throw new Error("Connect a wallet and select an image first.");
    setMetadataUploading(true);
    setMetadataError(null);
    try {
      const nonceResponse = await fetch(`${apiUrl}/v1/metadata/nonce?address=${wallet.address}&requestId=${requestId}`);
      if (!nonceResponse.ok) throw new Error("Could not create an upload authorization.");
      const authorization = await nonceResponse.json() as { message: string };
      const signature = await signer.signMessageAsync({ message: authorization.message });
      const x = form.x
        ? (form.x.startsWith("http") ? form.x : `https://x.com/${form.x.replace(/^@/, "")}`)
        : "";
      const telegram = form.telegram
        ? (form.telegram.startsWith("http")
          ? form.telegram
          : form.telegram.startsWith("@")
            ? `https://t.me/${form.telegram.slice(1)}`
            : `https://${form.telegram.replace(/^\/?/, "")}`)
        : "";
      const response = await fetch(`${apiUrl}/v1/metadata`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, x, telegram, address: wallet.address, signature }),
      });
      const result = await response.json() as { metadataUri?: string; error?: string };
      if (!response.ok || !result.metadataUri) throw new Error(result.error ?? "Metadata upload failed.");
      setForm((current) => ({ ...current, metadataURI: result.metadataUri! }));
      return result.metadataUri;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Metadata upload failed.";
      setMetadataError(message);
      throw cause;
    } finally {
      setMetadataUploading(false);
    }
  };

  return {
    form, set, selectGroup, toggleDestination, enableHolders, disableHolders,
    identityErrors, economicsErrors,
    identityOk: Object.keys(identityErrors).length === 0,
    economicsOk: Object.keys(economicsErrors).length === 0,
    opening, openingWei, openingTokensOut: tokensOut, openingQuote, openingPct, openingQuoteLoading: openingRead.isLoading,
    launchFeeHype, maxWalletPct, protocol, destinationLabel, walletAddress: wallet.address,
    uploadMetadata, metadataUploading, metadataError,
  };
}

export type LaunchFormApi = ReturnType<typeof useLaunchForm>;
