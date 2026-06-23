/**
 * One-shot backfill: move bookings with pending UPI proof to pending_approval.
 * Migration 0066 adds the enum; 0067 backfills rows. Use this for manual verification only.
 *
 *   npx tsx scripts/backfill-pending-approval-status.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function main() {
  const result = await db.execute(sql`
    UPDATE bookings b
    SET status = 'pending_approval', updated_at = now()
    WHERE b.status = 'pending_payment'
      AND EXISTS (
        SELECT 1 FROM pg_payment_records pr
        WHERE pr.booking_id = b.id AND pr.status = 'pending'
      )
    RETURNING b.booking_code, b.id
  `);
  const rows = result as unknown as { booking_code: string; id: string }[];
  console.log(`Updated ${rows.length} booking(s) to pending_approval:`);
  for (const row of rows) {
    console.log(`  ${row.booking_code} (${row.id})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
