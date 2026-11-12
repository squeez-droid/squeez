"use client";
import { useEffect, useMemo, useState } from "react";
import { MAX_CREATOR_FEE_BPS, TOTAL_SUPPLY } from "@squeez/shared";
import { formatEther, parseEther } from "viem";
import { useReadContract, useSignMessage } from "wagmi";
import { content } from "@/lib/data";
import { launchFactoryAbi } from "@/lib/abis";
import { useSelectedTarget } from "@/lib/use-selected-target";
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
export interface IdentityCheck {
  configured: boolean;
  available: boolean;
  duplicate?: boolean;
  lockedUntil?: string | null;
  permanentlyLocked?: boolean;
  originalToken?: string | null;
  warnings?: Array<{ type: string; originalToken: string; chain?: string }>;
}
export interface XVerification {
  verified: boolean;
  wallet?: string;
  username?: string;
  expiresAt?: string;
}
export interface CreatorAttestationResponse {
  attestation: {
    creator: `0x${string}`;
    socialHash: `0x${string}`;
    nameCommitment: `0x${string}`;
    symbolCommitment: `0x${string}`;
    metadataHash: `0x${string}`;
    imageHash: `0x${string}`;
    nonce: string;
    deadline: string;
  };
  signature: `0x${string}`;
}

const INITIAL: LaunchForm = {
  name: "", ticker: "", image: null, metadataURI: null, description: "", x: "", telegram: "", website: "",
  group: "hype", quote: "HYPE", feeWallet: "", creatorFeeBps: 100,
  destWallet: true, destBuyback: false, destHolders: false, buybackBps: 5000, openingBuy: "",
};

const E = content.launch.errors;
/** Quote pairs shown for a pair group in the Economics step. */
export function pairsForGroup(group: PairGroup, nativeSymbol = "HYPE"): QuotePair[] {
  return group === "hype" ? [{
    symbol: nativeSymbol, name: `Native ${nativeSymbol}`, category: "crypto", source: "SqueezQuoteRegistry",
    status: "ready", enabled: true, decimals: 18, usd: 0, color: "#50E3C2",
    address: "0x0000000000000000000000000000000000000000",
  }] : [];
}

function validateIdentity(f: LaunchForm): FormErrors {
  const e: FormErrors = {};
  if (f.name.trim().length < 2) e.name = E.nameShort;
  if (f.name.length > 32) e.name = E.nameLong;
  if (!/^[A-Z0-9]{2,10}$/.test(f.ticker)) e.ticker = E.ticker;
  if (!f.image) e.image = E.image;
  if (f.description.length > 280) e.description = E.description;
  if (f.website && !/^https?:\/\//.test(f.website)) e.website = E.website;
  return e;
}

/** Form state, validation and derived numbers for the launch wizard. */
export function useLaunchForm() {
  const selected = useSelectedTarget();
  const nativeSymbol = selected.info.nativeCurrency.symbol;
  const targetApiUrl = selected.targetApiUrl;
  const wallet = useWallet();
  const signer = useSignMessage();
  const protocol = useProtocolConfig();
  const [form, setForm] = useState<LaunchForm>(INITIAL);
  const [metadataUploading, setMetadataUploading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [evidenceImageHash, setEvidenceImageHash] = useState<`0x${string}` | null>(null);
  const [identityCheck, setIdentityCheck] = useState<IdentityCheck | null>(null);
  const [identityChecking, setIdentityChecking] = useState(false);
  const [xVerification, setXVerification] = useState<XVerification>({ verified: false });
  const [xVerificationLoading, setXVerificationLoading] = useState(false);

  useEffect(() => {
    setForm((current) => current.group === "hype" && current.quote !== nativeSymbol
      ? { ...current, quote: nativeSymbol }
      : current);
  }, [nativeSymbol]);

  const set = <K extends keyof LaunchForm>(key: K, value: LaunchForm[K]) => {
    if (["name", "ticker", "image", "description", "x", "telegram", "website"].includes(key)) {
      setEvidenceImageHash(null);
    }
    setForm((s) => ({
      ...s,
      [key]: value,
      ...(["name", "ticker", "image", "description", "x", "telegram", "website"].includes(key) ? { metadataURI: null } : {}),
    }));
  };
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
  const communityMaxOpeningBuy = Number(protocol.data?.release.maxOpeningBuyNative ?? 0);

  useEffect(() => {
    if (form.name.trim().length < 2 || form.name.length > 32 || !/^[A-Z0-9]{2,10}$/.test(form.ticker)) {
      setIdentityCheck(null);
      setIdentityChecking(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIdentityChecking(true);
      const query = new URLSearchParams({ name: form.name.trim(), symbol: form.ticker });
      fetch(`${targetApiUrl}/identity/check?${query}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Identity check failed");
          setIdentityCheck(await response.json() as IdentityCheck);
        })
        .catch((cause: unknown) => {
          if (!(cause instanceof DOMException && cause.name === "AbortError")) setIdentityCheck(null);
        })
        .finally(() => setIdentityChecking(false));
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.name, form.ticker, targetApiUrl]);

  useEffect(() => {
    fetch(`${targetApiUrl}/auth/x/session`, { credentials: "include" })
      .then((response) => response.ok ? response.json() as Promise<XVerification> : { verified: false })
      .then((session) => setXVerification(session))
      .catch(() => setXVerification({ verified: false }));
  }, [targetApiUrl]);

  const connectX = async () => {
    if (!wallet.address) throw new Error("Connect your wallet before verifying X.");
    setXVerificationLoading(true);
    try {
      const nonceResponse = await fetch(`${targetApiUrl}/auth/x/nonce?address=${wallet.address}`, {
        credentials: "include",
      });
      if (!nonceResponse.ok) throw new Error("Could not create X verification authorization.");
      const authorization = await nonceResponse.json() as { message: string };
      const signature = await signer.signMessageAsync({ message: authorization.message });
      const startResponse = await fetch(`${targetApiUrl}/auth/x/start`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: wallet.address,
          signature,
          returnTo: `${window.location.origin}/launch`,
        }),
      });
      const result = await startResponse.json() as { authorizeUrl?: string; error?: string };
      if (!startResponse.ok || !result.authorizeUrl) throw new Error(result.error ?? "X verification failed.");
      window.location.assign(result.authorizeUrl);
    } finally {
      setXVerificationLoading(false);
    }
  };

  const disconnectX = async () => {
    await fetch(`${targetApiUrl}/auth/x/session`, { method: "DELETE", credentials: "include" });
    setXVerification({ verified: false });
  };

  const requestXAttestation = async (metadataURI: string, imageHash: `0x${string}`) => {
    if (!wallet.address || !xVerification.verified) throw new Error("A verified X session is required.");
    const response = await fetch(`${targetApiUrl}/auth/x/attestation`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: wallet.address, metadataURI, imageHash, name: form.name, symbol: form.ticker }),
    });
    const result = await response.json() as CreatorAttestationResponse & { error?: string };
    if (response.status === 503) return null;
    if (!response.ok || !result.attestation || !result.signature) {
      throw new Error(result.error ?? "Could not create the verified creator attestation.");
    }
    return result;
  };

  const identityErrors = useMemo(() => {
    const errors = validateIdentity(form);
    if (identityCheck && !identityCheck.available) {
      errors.ticker = identityCheck.permanentlyLocked
        ? "This ticker is permanently locked by its original token."
        : "This identity is temporarily locked by its original token.";
    }
    return errors;
  }, [form, identityCheck]);

  const economicsErrors = useMemo(() => {
    const e: FormErrors = {};
    if (!isAddress(form.feeWallet)) e.feeWallet = E.feeWallet;
    if (form.creatorFeeBps < 0 || form.creatorFeeBps > MAX_CREATOR_FEE_BPS) e.fee = E.fee;
    if (!form.destWallet && !form.destBuyback && !form.destHolders) e.dest = E.dest;
    if (form.destBuyback || form.destHolders) e.dest = `Only direct fee-wallet payouts are enabled for the ${nativeSymbol} v1 release.`;
    if (opening < 0) e.opening = E.openingNegative;
    if (maxWalletPct > 0 && openingPct > maxWalletPct) e.opening = fill(E.openingMaxWallet, { pct: maxWalletPct });
    if (protocol.data?.network === "mainnet" && communityMaxOpeningBuy > 0 && opening > communityMaxOpeningBuy) {
      e.opening = `Community canary opening buys are capped at ${communityMaxOpeningBuy} ${nativeSymbol}.`;
    }
    if (wallet.status === "connected" && opening + launchFeeHype > (wallet.balances[nativeSymbol] ?? 0)) e.opening = E.openingBalance;
    if (openingWei > 0n && openingRead.isError) e.opening = "Unable to quote the opening buy on-chain.";
    return e;
  }, [form, opening, openingPct, maxWalletPct, communityMaxOpeningBuy, launchFeeHype, openingWei, openingRead.isError, wallet.status, wallet.balances, nativeSymbol, protocol.data?.network]);

  const selectGroup = (group: PairGroup) => {
    const first = pairsForGroup(group, nativeSymbol)[0];
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

  const uploadMetadata = async (requestId: string): Promise<{ metadataURI: string; imageHash: `0x${string}` }> => {
    if (form.metadataURI && evidenceImageHash) {
      return { metadataURI: form.metadataURI, imageHash: evidenceImageHash };
    }
    if (!wallet.address || !form.image) throw new Error("Connect a wallet and select an image first.");
    setMetadataUploading(true);
    setMetadataError(null);
    try {
      const nonceResponse = await fetch(`${targetApiUrl}/metadata/nonce?address=${wallet.address}&requestId=${requestId}`);
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
      const response = await fetch(`${targetApiUrl}/metadata`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          // The launch form calls this field `ticker`, while the metadata API
          // uses the ERC-20 terminology `symbol`.
          symbol: form.ticker,
          x,
          telegram,
          address: wallet.address,
          signature,
        }),
      });
      const result = await response.json() as { metadataUri?: string; imageHash?: `0x${string}`; error?: string };
      if (!response.ok || !result.metadataUri || !result.imageHash) throw new Error(result.error ?? "Metadata upload failed.");
      setForm((current) => ({ ...current, metadataURI: result.metadataUri! }));
      setEvidenceImageHash(result.imageHash);
      return { metadataURI: result.metadataUri, imageHash: result.imageHash };
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
    identityOk: Object.keys(identityErrors).length === 0 && !identityChecking,
    economicsOk: Object.keys(economicsErrors).length === 0,
    opening, openingWei, openingTokensOut: tokensOut, openingQuote, openingPct, openingQuoteLoading: openingRead.isLoading,
    launchFeeHype, maxWalletPct, communityMaxOpeningBuy, protocol, destinationLabel, walletAddress: wallet.address, nativeSymbol,
    uploadMetadata, metadataUploading, metadataError, identityCheck, identityChecking,
    xVerification, xVerificationLoading, connectX, disconnectX, requestXAttestation,
  };
}

export type LaunchFormApi = ReturnType<typeof useLaunchForm>;
