/**
 * Repair active monthly bookings: unbounded stay_range + billing_anchor_date.
 * Run after migration 0094 on environments that still have 2099 sentinel uppers.
 *
 *   npx tsx scripts/repair-monthly-stay-ranges.ts
 *   npx tsx scripts/repair-monthly-stay-ranges.ts --dry-run
 */

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const preview = await db.execute<{ booking_id: string; booking_code: string }>(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code
    FROM bookings bk
    INNER JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind = 'primary'
    WHERE bk.duration_mode IN ('open_ended', 'monthly')
      AND bk.stay_type = 'monthly_stay'
      AND br.status IN ('active', 'hold')
      AND (
        upper(br.stay_range) IS NOT NULL AND upper(br.stay_range) >= '2090-01-01'::date
        OR bk.billing_anchor_date IS NULL
        OR bk.expected_checkout_date IS NOT NULL
      )
    ORDER BY bk.booking_code
  `);

  console.log(`Found ${preview.length} monthly booking(s) to repair.`);
  for (const row of preview) {
    console.log(`  ${row.booking_code} (${row.booking_id})`);
  }

  if (dryRun || preview.length === 0) {
    console.log(dryRun ? 'Dry run — no changes written.' : 'Nothing to repair.');
    return;
  }

  await db.execute(sql`
    UPDATE bed_reservations br
    SET stay_range = daterange(lower(br.stay_range), NULL, '[)'),
        updated_at = now()
    FROM bookings bk
    WHERE br.booking_id = bk.id
      AND br.kind = 'primary'
      AND br.status IN ('active', 'hold')
      AND bk.duration_mode IN ('open_ended', 'monthly')
      AND bk.stay_type = 'monthly_stay'
      AND upper(br.stay_range) IS NOT NULL
      AND upper(br.stay_range) >= '2090-01-01'::date
  `);

  await db.execute(sql`
    UPDATE bookings bk
    SET billing_anchor_date = lower(br.stay_range)::date,
        updated_at = now()
    FROM bed_reservations br
    WHERE br.booking_id = bk.id
      AND br.kind = 'primary'
      AND br.status IN ('active', 'hold')
      AND bk.duration_mode IN ('open_ended', 'monthly')
      AND bk.billing_anchor_date IS NULL
      AND lower(br.stay_range) IS NOT NULL
  `);

  await db.execute(sql`
    UPDATE bookings
    SET expected_checkout_date = NULL,
        updated_at = now()
    WHERE duration_mode IN ('open_ended', 'monthly')
      AND stay_type = 'monthly_stay'
      AND expected_checkout_date IS NOT NULL
  `);

  console.log('Repair complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
