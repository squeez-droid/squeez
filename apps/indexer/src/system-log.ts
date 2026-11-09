import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { LOG_EVENTS, parseNetwork } from "@squeez/shared";

const network = parseNetwork(process.env.SQUEEZ_NETWORK);
const chainId = Number(process.env.ELYSIUM_CHAIN_ID);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

export async function logIndexed(eventName: string, txHash: string, blockNumber: bigint, logIndex: number) {
  const context = { eventName, logIndex };
  console.log(JSON.stringify({ event: LOG_EVENTS.eventIndexed, txHash, blockNumber: blockNumber.toString(), context }));
  await pool.query(
    `insert into "${network}_system".system_log
      (source, event, tx_hash, chain_id, block_number, request_id, context)
     values (
       'indexer',$1,$2,$3,$4,
       coalesce(
         (select request_id from "${network}_system".system_log
          where tx_hash = $2 and request_id is not null
          order by created_at asc limit 1),
         $5
       ),
       $6
     )`,
    [LOG_EVENTS.eventIndexed, txHash, chainId, blockNumber, randomUUID(), context],
  ).catch((error: unknown) => {
    console.error(JSON.stringify({ event: "system_log.write_failed",
      targetEvent: LOG_EVENTS.eventIndexed, error: error instanceof Error ? error.message : "unknown" }));
  });
}

