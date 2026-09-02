/**
 * Room-change engine columns (`expires_at`, `workflow_state`) land in 0149.
 * Occupancy readers must not 500 if code deploys before the migration.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

let readyPromise: Promise<boolean> | null = null;

export function roomChangeEngineSchemaReady(): Promise<boolean> {
  readyPromise ??= db
    .execute<{ ready: boolean }>(sql`
      SELECT (
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'room_transfer_bed_holds'
            AND column_name = 'expires_at'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'room_change_requests'
            AND column_name = 'workflow_state'
        )
      ) AS ready
    `)
    .then((rows) => Boolean(rows[0]?.ready));
  return readyPromise;
}
