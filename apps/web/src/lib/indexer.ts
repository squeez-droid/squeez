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
  status: "curve" | "graduated";
  pool: Address | null;
  createdAt: string;
  launchTxHash: `0x${string}`;
  launchBlockNumber: string;
  launchLogIndex: number;
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
