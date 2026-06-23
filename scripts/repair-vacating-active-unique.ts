/* eslint-disable no-console */
/**
 * Audit + optional repair for vacating active-request uniqueness.
 *
 * Before migration 0064, UNIQUE(booking_id) blocked resubmit after admin reject.
 * After migration, only pending/approved rows block. This script:
 *   1. Reports bookings with duplicate active vacating rows (should be 0).
 *   2. Reports rejected/completed historical rows (informational — no repair needed).
 *
 * Usage:
 *   npx tsx scripts/repair-vacating-active-unique.ts          # audit only
 *   npx tsx scripts/repair-vacating-active-unique.ts --apply  # same (no data mutation)
 *
 * Production deploy:
 *   1. npm run db:migrate   # applies 0064_vacating_active_unique.sql
 *   2. npx tsx scripts/repair-vacating-active-unique.ts
 *   3. Verify: reject a test notice, resident submits new date successfully.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';

async function main() {
  const apply = process.argv.includes('--apply');

  const duplicateActive = await db.execute<{
    booking_id: string;
    active_count: string;
  }>(sql`
    SELECT booking_id::text, COUNT(*)::text AS active_count
    FROM vacating_requests
    WHERE status IN ('pending', 'approved')
    GROUP BY booking_id
    HAVING COUNT(*) > 1
  `);

  const rejectedHistorical = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM vacating_requests
    WHERE status = 'rejected'
  `);

  const completedHistorical = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM vacating_requests
    WHERE status = 'completed'
  `);

  const indexCheck = await db.execute<{ indexname: string }>(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'vacating_requests'
      AND indexname IN (
        'vacating_requests_one_open_per_booking',
        'vacating_requests_one_active_per_booking'
      )
  `);

  console.log('Vacating active-request audit');
  console.log('  duplicate active rows (pending/approved per booking):', duplicateActive.length);
  if (duplicateActive.length > 0) {
    console.table(duplicateActive);
    console.error('Resolve duplicate active rows manually before deploy.');
    process.exitCode = 1;
  }

  console.log('  rejected historical rows:', rejectedHistorical[0]?.count ?? '0');
  console.log('  completed historical rows:', completedHistorical[0]?.count ?? '0');
  console.log(
    '  indexes present:',
    indexCheck.map((r) => r.indexname).join(', ') || '(none)',
  );

  if (apply) {
    console.log('\nNo data mutation required — migration 0064 fixes the constraint only.');
  } else {
    console.log('\nDry run complete. Re-run with --apply after migration (informational only).');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
