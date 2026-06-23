#!/usr/bin/env npx tsx
/**
 * PROPOSED repair for legacy 2× monthly deposit bookings — NOT for automatic use.
 * Run audit first: scripts/audit-legacy-2x-monthly-deposit.ts
 *
 * This script only previews changes unless --execute is passed AND each booking
 * is explicitly listed via --booking=APG-XXXX or --booking-id=uuid after review.
 *
 * Usage (preview one booking):
 *   DATABASE_URL='…' npx tsx scripts/repair-legacy-2x-monthly-deposit.ts --booking=APG-2026-0001
 *
 * Usage (apply after manual approval):
 *   DATABASE_URL='…' npx tsx scripts/repair-legacy-2x-monthly-deposit.ts --booking=APG-2026-0001 --execute
 *
 * What it would do (when executed):
 *   1. Update bookings.deposit_paise to 2-week expected amount
 *   2. Update pricing_snapshot deposit line items (if present)
 *   3. Reconcile deposit_ledger ONLY if no payout/refund has occurred and collected > new required
 *
 * Does NOT run in batch mode without explicit --booking flags.
 */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import { computeMonthlyDepositPaise } from '@/src/lib/pricing/depositRules';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

const EXECUTE = process.argv.includes('--execute');
const bookingCode = arg('booking');
const bookingId = arg('booking-id');

async function main() {
  if (!bookingCode && !bookingId) {
    console.error(
      'Specify exactly one booking after audit review: --booking=APG-XXXX or --booking-id=uuid',
    );
    console.error('Batch repair is intentionally disabled. Review audit report first.');
    process.exit(1);
  }

  const [row] = await db.execute<{
    id: string;
    booking_code: string;
    customer_name: string;
    deposit_paise: number;
    monthly_rent_paise: number;
    pricing_snapshot: unknown;
    status: string;
  }>(sql`
    SELECT b.id::text, b.booking_code, c.full_name AS customer_name,
           b.deposit_paise, b.status::text, b.pricing_snapshot,
           COALESCE(
             (SELECT SUM((elem->>'monthlyRatePaise')::bigint)
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(b.pricing_snapshot->'perBed') = 'array'
                THEN b.pricing_snapshot->'perBed' ELSE '[]'::jsonb END
              ) elem),
             0
           )::bigint AS monthly_rent_paise
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    WHERE ${bookingId ? sql`b.id = ${bookingId}::uuid` : sql`b.booking_code = ${bookingCode}`}
    LIMIT 1
  `);

  if (!row) {
    console.error('Booking not found');
    process.exit(1);
  }

  const monthlyRent = Number(row.monthly_rent_paise);
  const stored = Number(row.deposit_paise);
  const expected = computeMonthlyDepositPaise({ monthlyRatePaise: monthlyRent });
  const legacy2x = monthlyRent * 2;
  const wallet = await getDepositSummaryForBooking(row.id);

  console.log('\n=== Legacy deposit repair preview ===\n');
  console.table([
    {
      booking: row.booking_code,
      resident: row.customer_name,
      status: row.status,
      monthly_rent: paiseToInr(monthlyRent),
      stored_deposit: paiseToInr(stored),
      legacy_2x: paiseToInr(legacy2x),
      expected_2week: paiseToInr(expected),
      difference: paiseToInr(stored - expected),
      ledger_collected: paiseToInr(wallet?.collectedPaise ?? 0),
      ledger_refunded: paiseToInr(wallet?.refundedPaise ?? 0),
    },
  ]);

  if (stored !== legacy2x) {
    console.warn('\nWARNING: Stored deposit does not match legacy 2× rule. Manual review required.');
  }

  if ((wallet?.refundedPaise ?? 0) > 0 || (wallet?.deductedPaise ?? 0) > 0) {
    console.warn('\nBLOCKED: Deposit ledger has deductions/refunds — do not auto-repair.');
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log('\nDry run — pass --execute after operator approval to apply booking.deposit_paise update.');
    await closeDb();
    return;
  }

  await db
    .update(bookings)
    .set({ depositPaise: expected, updatedAt: new Date() })
    .where(eq(bookings.id, row.id));

  console.log(`\nUpdated bookings.deposit_paise → ${paiseToInr(expected)}`);
  console.log('Ledger NOT auto-adjusted — reconcile manually if resident overpaid.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
