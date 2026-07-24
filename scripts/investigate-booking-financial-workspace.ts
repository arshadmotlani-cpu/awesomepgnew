/* eslint-disable no-console */
/**
 * Read-only investigation for Booking Financial Workspace / move-out approval.
 *
 * Usage:
 *   npx tsx scripts/investigate-booking-financial-workspace.ts --bookingId=28520507-32da-4d80-84d5-b35db3e01963
 *   npx tsx scripts/investigate-booking-financial-workspace.ts --booking=APG-2026-0083
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

async function main() {
  const bookingId = arg('bookingId');
  const bookingCode = arg('booking');

  if (!bookingId && !bookingCode) {
    console.error('Pass --bookingId=UUID or --booking=CODE');
    process.exit(1);
  }

  console.log('\n=== Booking financial workspace (read-only) ===\n');

  const bookings = await db.execute(sql`
    SELECT id, booking_code, status, updated_at
    FROM bookings
    WHERE (${bookingId ?? null}::uuid IS NOT NULL AND id = ${bookingId ?? null}::uuid)
       OR (${bookingCode ?? null}::text IS NOT NULL AND booking_code = ${bookingCode ?? null})
    LIMIT 1
  `);
  console.log('--- Booking ---');
  console.table(bookings);
  const b = bookings[0] as { id: string; booking_code: string; status: string } | undefined;
  if (!b) {
    console.log('Booking not found.');
    await closeDb();
    return;
  }

  const vacating = await db.execute(sql`
    SELECT id, status, notice_given_date, vacating_date, updated_at
    FROM vacating_requests
    WHERE booking_id = ${b.id}::uuid
    ORDER BY created_at DESC
    LIMIT 3
  `);
  console.log('\n--- Vacating requests ---');
  console.table(vacating);

  const vr = vacating[0] as { id: string; status: string } | undefined;
  if (vr) {
    const audit = await db.execute(sql`
      SELECT created_at, action, diff
      FROM audit_log
      WHERE entity = 'vacating_request'
        AND entity_id = ${vr.id}::uuid
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('\n--- Vacating audit (recent) ---');
    console.table(audit);
  }

  const reservations = await db.execute(sql`
    SELECT kind, status, stay_range::text AS stay_range
    FROM bed_reservations
    WHERE booking_id = ${b.id}::uuid
    ORDER BY created_at DESC
    LIMIT 3
  `);
  console.log('\n--- Bed reservations ---');
  console.table(reservations);

  const dateChanges = await db.execute(sql`
    SELECT id, status, current_vacating_date, requested_vacating_date, refund_delta_paise, created_at
    FROM vacating_date_change_requests
    WHERE booking_id = ${b.id}::uuid
    ORDER BY created_at DESC
    LIMIT 3
  `);
  console.log('\n--- Date change requests ---');
  console.table(dateChanges);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
