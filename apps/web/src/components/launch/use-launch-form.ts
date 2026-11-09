"use client";
import { useEffect, useMemo, useState } from "react";
import { config, content, quotePairs, tokens } from "@/lib/data";
import { SUPPLY, quoteBuy } from "@/lib/curve";
import { fill, isAddress } from "@/lib/format";
import type { QuotePair } from "@/lib/types";
import { useWallet } from "@/providers/wallet";

export type PairGroup = "hype" | "crypto" | "stock";
export type Destination = "wallet" | "buyback" | "holders";

export interface LaunchForm {
  name: string;
  ticker: string;
  image: string | null;
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
  name: "", ticker: "", image: null, description: "", x: "", telegram: "", website: "",
  group: "hype", quote: "HYPE", feeWallet: "", creatorFeeBps: 100,
  destWallet: true, destBuyback: false, destHolders: false, buybackBps: 5000, openingBuy: "",
};

const P = config.protocol;
const LC = config.launchConfig;
const E = content.launch.errors;
const MAX_WALLET_PCT = LC.maxWallet.bps / 100;

/** Quote pairs shown for a pair group in the Economics step. */
export function pairsForGroup(group: PairGroup): QuotePair[] {
  if (group === "hype") return quotePairs.filter((p) => p.symbol === "HYPE");
  if (group === "stock") return quotePairs.filter((p) => p.category === "stock");
  return quotePairs.filter((p) => p.symbol !== "HYPE" && (p.category === "crypto" || p.category === "stable"));
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
  const [form, setForm] = useState<LaunchForm>(INITIAL);

  const set = <K extends keyof LaunchForm>(key: K, value: LaunchForm[K]) => setForm((s) => ({ ...s, [key]: value }));
  const patch = (p: Partial<LaunchForm>) => setForm((s) => ({ ...s, ...p }));

  // Default fee wallet = launching wallet.
  useEffect(() => {
    if (wallet.address && !form.feeWallet) set("feeWallet", wallet.address);
  }, [wallet.address, form.feeWallet]);

  const opening = parseFloat(form.openingBuy) || 0;
  const openingQuote = quoteBuy(0, opening, form.creatorFeeBps);
  const openingPct = (openingQuote.outAmount / SUPPLY) * 100;

  const identityErrors = useMemo(() => validateIdentity(form), [form]);

  const economicsErrors = useMemo(() => {
    const e: FormErrors = {};
    if (!isAddress(form.feeWallet)) e.feeWallet = E.feeWallet;
    if (form.creatorFeeBps < 0 || form.creatorFeeBps > P.MAX_CREATOR_FEE_BPS) e.fee = E.fee;
    if (!form.destWallet && !form.destBuyback && !form.destHolders) e.dest = E.dest;
    if (opening < 0) e.opening = E.openingNegative;
    if (openingPct > MAX_WALLET_PCT) e.opening = fill(E.openingMaxWallet, { pct: MAX_WALLET_PCT });
    if (wallet.status === "connected" && opening + P.launchFeeHype > (wallet.balances.HYPE ?? 0)) e.opening = E.openingBalance;
    return e;
  }, [form, opening, openingPct, wallet.status, wallet.balances.HYPE]);

  const selectGroup = (group: PairGroup) => {
    const first = pairsForGroup(group).find((p) => group !== "crypto" || p.enabled) ?? quotePairs[0];
    patch({ group, quote: first.symbol });
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

  return {
    form, set, selectGroup, toggleDestination, enableHolders, disableHolders,
    identityErrors, economicsErrors,
    identityOk: Object.keys(identityErrors).length === 0,
    economicsOk: Object.keys(economicsErrors).length === 0,
    opening, openingQuote, openingPct, destinationLabel,
  };
}

export type LaunchFormApi = ReturnType<typeof useLaunchForm>;
