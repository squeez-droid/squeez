"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "@squeez/shared";
import { targetApiUrl } from "./chain";
import { useSelectedTarget } from "./use-selected-target";

export interface IndexedToken {
  address: Address;
  curve: Address;
  creator: Address;
  quote: Address;
  creatorFeeBps: number;
  feeRecipient: Address;
  feeDestinationKind: number;
  buybackBps: number;
  launchConfigId: string;
  name: string | null;
  symbol: string | null;
  metadataUri: string | null;
  status: "curve" | "graduating" | "graduated";
  venue: "curve" | "uniswap-v4";
  pool: Address | null;
  createdAt: string;
  launchTxHash: `0x${string}`;
  launchBlockNumber: string;
  launchLogIndex: number;
  /** Latest curve reserve raised, in wei. Derived from indexed CurveTrade events. */
  hypeRaised: string;
  holdersCount?: number;
  tradeCount: number;
  volume24hHype: string;
  lastHypeAmount: string;
  lastTokenAmount: string;
  identityStatus: "original" | "copy" | "unverified" | "unavailable";
  duplicateName: boolean;
  duplicateSymbol: boolean;
  originalToken: Address | null;
  lockedUntil: string | null;
  permanentlyLocked: boolean;
}

export interface IndexedTrade {
  id: string;
  token: Address;
  trader: Address;
  isBuy: boolean;
  hypeAmount: string;
  tokenAmount: string;
  source: "curve" | "pool";
  hypeRaised: string | null;
  timestamp: string;
  txHash: `0x${string}`;
  blockNumber: string;
  logIndex: number;
}

export interface IndexedCreatorFee {
  id: string;
  token: Address;
  asset: Address;
  kind: "accrued" | "claimed";
  recipient: Address | null;
  amount: string;
  timestamp: string;
  txHash: `0x${string}`;
  blockNumber: string;
  logIndex: number;
}

export interface IndexedHolder {
  account: Address;
  balance: string;
  updatedAt: string;
  blockNumber: string;
}

export interface IndexedStats {
  volume24hHype: string;
  trades24h: number;
  creatorFees24hHype: string;
  protocolFees24hHype: string;
  squeezBurned: string;
  tokensLaunched: number;
  tokensGraduated: number;
}

export interface IndexedMetadata {
  schema: "squeez.token.v1" | "squeez.token.v2" | null;
  description: string;
  links: { website?: string | null; x?: string | null; telegram?: string | null };
  imagePath: string | null;
}

export interface ActiveQuote {
  asset: Address;
  decimals: number;
  category: "crypto" | "stable" | "stock" | "unclassified";
  symbol: string | null;
  routeConfigured: boolean;
}

export interface DataSourceStatus {
  capability?: "enabled" | "read-only";
  writeSafe?: boolean;
  writeBlockers?: string[];
  network: string;
  checkedAt: number;
  rpc: { ok: boolean; blockNumber: number | null };
  indexer: { ok: boolean; blockNumber: number | null; updatedAt: number | null; lagBlocks: number | null; stale: boolean };
}

export const isIndexerConfigured = Boolean(targetApiUrl);

async function request<T>(path: string, signal?: AbortSignal, baseUrl = targetApiUrl): Promise<T> {
  const response = await fetch(`${baseUrl}${path.replace(/^\/v1/, "")}`, { signal });
  if (!response.ok) throw new Error(`Indexer request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export function listIndexedTokens(signal?: AbortSignal, baseUrl = targetApiUrl): Promise<IndexedToken[]> {
  return request<IndexedToken[]>("/v1/tokens", signal, baseUrl);
}

export async function getIndexedToken(address: string, signal?: AbortSignal, baseUrl = targetApiUrl): Promise<IndexedToken | null> {
  const response = await fetch(`${baseUrl}/tokens/${encodeURIComponent(address)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Indexer request failed (${response.status}).`);
  return response.json() as Promise<IndexedToken>;
}

export function listIndexedTrades(address: string, signal?: AbortSignal, baseUrl = targetApiUrl): Promise<IndexedTrade[]> {
  return request<IndexedTrade[]>(`/v1/tokens/${encodeURIComponent(address)}/trades`, signal, baseUrl);
}

export function listIndexedCreatorFees(address: string, signal?: AbortSignal, baseUrl = targetApiUrl): Promise<IndexedCreatorFee[]> {
  return request<IndexedCreatorFee[]>(`/v1/tokens/${encodeURIComponent(address)}/fees`, signal, baseUrl);
}

export function listIndexedHolders(address: string, signal?: AbortSignal, baseUrl = targetApiUrl): Promise<IndexedHolder[]> {
  return request<IndexedHolder[]>(`/v1/tokens/${encodeURIComponent(address)}/holders`, signal, baseUrl);
}

export async function getIndexedMetadata(address: string, signal?: AbortSignal, baseUrl = targetApiUrl): Promise<IndexedMetadata | null> {
  const response = await fetch(`${baseUrl}/tokens/${encodeURIComponent(address)}/metadata`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Metadata request failed (${response.status}).`);
  return response.json() as Promise<IndexedMetadata>;
}

export function getIndexedStats(signal?: AbortSignal, baseUrl = targetApiUrl): Promise<IndexedStats> {
  return request<IndexedStats>("/v1/stats", signal, baseUrl);
}

export function listActiveQuotes(signal?: AbortSignal, baseUrl = targetApiUrl): Promise<ActiveQuote[]> {
  return request<ActiveQuote[]>("/v1/quotes", signal, baseUrl);
}

export function getDataSourceStatus(signal?: AbortSignal, baseUrl = targetApiUrl): Promise<DataSourceStatus> {
  return request<DataSourceStatus>("/v1/status", signal, baseUrl);
}

export function useDataSourceStatus() {
  const selected = useSelectedTarget();
  return useQuery({
    queryKey: ["data-source-status", selected.targetApiUrl],
    queryFn: ({ signal }) => getDataSourceStatus(signal, selected.targetApiUrl),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
