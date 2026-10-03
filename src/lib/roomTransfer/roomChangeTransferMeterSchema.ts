/**
 * Cross-room transfer meter column — deploy before enforcing evidence gate.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

let readyPromise: Promise<boolean> | null = null;

export function roomChangeTransferMeterSchemaReady(): Promise<boolean> {
  readyPromise ??= db
    .execute<{ ready: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'room_change_requests'
          AND column_name = 'transfer_meter_log_id'
      ) AS ready
    `)
    .then((rows) => Boolean(rows[0]?.ready));
  return readyPromise;
}
