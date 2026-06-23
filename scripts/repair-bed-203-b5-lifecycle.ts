#!/usr/bin/env npx tsx
/**
 * Repair Harish / Room 203 B5 vacating lifecycle on production.
 *
 * - Backfill missing checkout_settlement for approved vacating
 * - Resolve stale refund_request_submitted action items when checkout owns flow
 *
 * Usage:
 *   DATABASE_URL=… npx tsx scripts/repair-bed-203-b5-lifecycle.ts --dry-run
 *   DATABASE_URL=… npx tsx scripts/repair-bed-203-b5-lifecycle.ts
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { backfillCheckoutSettlementsFromVacating } from '@/src/services/checkoutSettlement';
import { syncResidentRequestActionItems } from '@/src/services/residentRequestActions';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const phone = arg('phone') ?? '6369363982';

  console.log(`\n=== Repair B5 lifecycle (dryRun=${dryRun}) phone=*${phone}*\n`);

  const rows = await db.execute(sql`
    SELECT
      c.id AS customer_id,
      c.full_name,
      c.phone,
      bk.id AS booking_id,
      bk.booking_code,
      vr.id AS vacating_id,
      vr.status AS vacating_status,
      cs.id AS settlement_id,
      cs.status AS settlement_status
    FROM customers c
    JOIN bookings bk ON bk.customer_id = c.id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id
    LEFT JOIN checkout_settlements cs ON cs.vacating_request_id = vr.id
    LEFT JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary'
    LEFT JOIN beds b ON b.id = br.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE c.phone ILIKE ${'%' + phone + '%'}
       OR (p.name ILIKE '%shanti%' AND r.room_number = '203' AND b.bed_code ILIKE '%B5%')
    ORDER BY bk.created_at DESC
    LIMIT 5
  `);

  console.log('Before:');
  console.table(rows);

  if (dryRun) {
    console.log('\nDry run — would call backfillCheckoutSettlementsFromVacating + syncResidentRequestActionItems');
    await closeDb();
    return;
  }

  const backfill = await backfillCheckoutSettlementsFromVacating();
  console.log('\nBackfill result:', backfill);

  await syncResidentRequestActionItems();
  console.log('Synced resident request action items (clears stale refund badges).');

  const after = await db.execute(sql`
    SELECT
      c.full_name,
      vr.status AS vacating_status,
      cs.id AS settlement_id,
      cs.status AS settlement_status
    FROM customers c
    JOIN bookings bk ON bk.customer_id = c.id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id
    LEFT JOIN checkout_settlements cs ON cs.vacating_request_id = vr.id
    WHERE c.phone ILIKE ${'%' + phone + '%'}
    ORDER BY bk.created_at DESC
    LIMIT 3
  `);
  console.log('\nAfter:');
  console.table(after);

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
