import type { DataSourceStatus } from "@/lib/indexer";

export function DataSourceState({ status }: { status: DataSourceStatus | null }) {
  if (!status) return null;
  if (!status.rpc.ok) return <div className="mb-4 rounded-md border border-down/60 bg-down/10 px-3 py-2 text-xs text-down">RPC is unavailable. Contract reads and transactions may fail.</div>;
  if (!status.indexer.ok) return <div className="mb-4 rounded-md border border-warn/60 bg-warn/10 px-3 py-2 text-xs text-warn">Indexer checkpoint is unavailable. Historical data may be incomplete.</div>;
  if (status.indexer.stale) return <div className="mb-4 rounded-md border border-warn/60 bg-warn/10 px-3 py-2 text-xs text-warn">Indexer is behind by {status.indexer.lagBlocks?.toLocaleString() ?? "an unknown number of"} blocks. On-chain transactions remain authoritative; lists may update late.</div>;
  return <div className="mb-4 flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 rounded-full bg-mint" />On-chain data live · indexer lag {status.indexer.lagBlocks?.toLocaleString() ?? 0} blocks</div>;
}
