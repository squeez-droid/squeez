export const LOG_EVENTS = {
  metadataNonceIssued: "metadata.nonce.issued",
  metadataUploadRequested: "metadata.upload.requested",
  metadataUploadSucceeded: "metadata.upload.succeeded",
  metadataUploadFailed: "metadata.upload.failed",
  txRequested: "tx.requested",
  txSubmitted: "tx.submitted",
  txConfirmed: "tx.confirmed",
  txFailed: "tx.failed",
  txRejected: "tx.rejected",
  eventIndexed: "chain.event.indexed",
  indexerReorg: "indexer.reorg",
  keeperTickStarted: "keeper.tick.started",
  keeperTickSkipped: "keeper.tick.skipped",
  keeperTickSucceeded: "keeper.tick.succeeded",
  keeperTickFailed: "keeper.tick.failed",
  graduationRequested: "graduation.requested",
  graduationSubmitted: "graduation.submitted",
  graduationConfirmed: "graduation.confirmed",
  graduationFailed: "graduation.failed",
} as const;

export type LogEvent = typeof LOG_EVENTS[keyof typeof LOG_EVENTS];
export const WEB_LOG_EVENTS: readonly LogEvent[] = [
  LOG_EVENTS.txRequested,
  LOG_EVENTS.txSubmitted,
  LOG_EVENTS.txConfirmed,
  LOG_EVENTS.txFailed,
  LOG_EVENTS.txRejected,
];
