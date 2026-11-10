import type { Address } from "@squeez/shared";
import { apiUrl } from "./chain";

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
  schema: "squeez.token.v1" | null;
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
  network: string;
  checkedAt: number;
  rpc: { ok: boolean; blockNumber: number | null };
  indexer: { ok: boolean; blockNumber: number | null; updatedAt: number | null; lagBlocks: number | null; stale: boolean };
}

export const isIndexerConfigured = Boolean(apiUrl);

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { signal });
  if (!response.ok) throw new Error(`Indexer request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export function listIndexedTokens(signal?: AbortSignal): Promise<IndexedToken[]> {
  return request<IndexedToken[]>("/v1/tokens", signal);
}

export async function getIndexedToken(address: string, signal?: AbortSignal): Promise<IndexedToken | null> {
  const response = await fetch(`${apiUrl}/v1/tokens/${encodeURIComponent(address)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Indexer request failed (${response.status}).`);
  return response.json() as Promise<IndexedToken>;
}

export function listIndexedTrades(address: string, signal?: AbortSignal): Promise<IndexedTrade[]> {
  return request<IndexedTrade[]>(`/v1/tokens/${encodeURIComponent(address)}/trades`, signal);
}

export function listIndexedCreatorFees(address: string, signal?: AbortSignal): Promise<IndexedCreatorFee[]> {
  return request<IndexedCreatorFee[]>(`/v1/tokens/${encodeURIComponent(address)}/fees`, signal);
}

export function listIndexedHolders(address: string, signal?: AbortSignal): Promise<IndexedHolder[]> {
  return request<IndexedHolder[]>(`/v1/tokens/${encodeURIComponent(address)}/holders`, signal);
}

export async function getIndexedMetadata(address: string, signal?: AbortSignal): Promise<IndexedMetadata | null> {
  const response = await fetch(`${apiUrl}/v1/tokens/${encodeURIComponent(address)}/metadata`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Metadata request failed (${response.status}).`);
  return response.json() as Promise<IndexedMetadata>;
}

export function getIndexedStats(signal?: AbortSignal): Promise<IndexedStats> {
  return request<IndexedStats>("/v1/stats", signal);
}

export function listActiveQuotes(signal?: AbortSignal): Promise<ActiveQuote[]> {
  return request<ActiveQuote[]>("/v1/quotes", signal);
}

export function getDataSourceStatus(signal?: AbortSignal): Promise<DataSourceStatus> {
  return request<DataSourceStatus>("/v1/status", signal);
}
