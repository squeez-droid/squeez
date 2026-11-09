import type { Address } from "@squeez/shared";

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "";

export const isIndexerConfigured = Boolean(url && anonKey && (schema === "testnet" || schema === "mainnet"));

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!isIndexerConfigured) throw new Error("Indexer is not configured for this network.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    signal,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Accept-Profile": schema,
    },
  });
  if (!response.ok) throw new Error(`Indexer request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export function listIndexedTokens(signal?: AbortSignal): Promise<IndexedToken[]> {
  return request<IndexedToken[]>("token?select=*&order=createdAt.desc", signal);
}

export async function getIndexedToken(address: string, signal?: AbortSignal): Promise<IndexedToken | null> {
  const rows = await request<IndexedToken[]>(`token?select=*&address=eq.${encodeURIComponent(address)}&limit=1`, signal);
  return rows[0] ?? null;
}
