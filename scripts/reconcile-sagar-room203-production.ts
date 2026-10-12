/* eslint-disable no-console */
/**
 * One-time production reconciliation for Sagar Karale (APG-2026-0112) / Room 203.
 *
 * Preview (default):
 *   USE_PRODUCTION_DB=1 npx tsx scripts/reconcile-sagar-room203-production.ts
 *
 * Execute:
 *   USE_PRODUCTION_DB=1 npx tsx scripts/reconcile-sagar-room203-production.ts --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('reconcile-sagar-room203');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import {
  reconcileRoomConfigurationDepositsForRoom,
  SYSTEM_ROOM_CONFIGURATION_SESSION,
} from '../src/services/roomConfigurationSchedule';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { paiseToInr } from '../src/lib/format';

const BOOKING_CODE = 'APG-2026-0112';
const EXECUTE = process.argv.includes('--execute');

async function main() {
  const [ctx] = await db.execute<{
    room_id: string;
    bed_id: string;
    pricing_effective_from: string;
    monthly_rate_paise: string;
    monthly_security_deposit_paise: string;
    schedule_id: string | null;
    schedule_effective_from: string | null;
    schedule_status: string | null;
    target_bed_count: number | null;
  }>(sql`
    WITH active AS (
      SELECT bk.id AS booking_id, r.id AS room_id, b.id AS bed_id
      FROM bookings bk
      INNER JOIN bed_reservations br ON br.booking_id = bk.id AND br.kind='primary' AND br.status='active'
      INNER JOIN beds b ON b.id = br.bed_id
      INNER JOIN rooms r ON r.id = b.room_id
      WHERE bk.booking_code = ${BOOKING_CODE}
      LIMIT 1
    )
    SELECT a.room_id::text, a.bed_id::text,
           bp.effective_from::text AS pricing_effective_from,
           bp.monthly_rate_paise::text,
           bp.monthly_security_deposit_paise::text,
           s.id::text AS schedule_id,
           s.effective_from::text AS schedule_effective_from,
           s.status AS schedule_status,
           s.target_bed_count
    FROM active a
    INNER JOIN bed_prices bp ON bp.bed_id = a.bed_id
      AND bp.monthly_rate_paise = 360600
      AND (bp.effective_to IS NULL OR bp.effective_to > CURRENT_DATE)
    LEFT JOIN room_configuration_schedules s ON s.room_id = a.room_id
      AND s.status = 'applied'
      AND s.monthly_rate_paise = 360600
    ORDER BY bp.effective_from DESC, s.effective_from DESC NULLS LAST
    LIMIT 1
  `);

  if (!ctx) {
    throw new Error('Could not resolve room 203 / B5 pricing (360600) for booking');
  }

  const effectiveFrom = ctx.schedule_effective_from ?? ctx.pricing_effective_from;
  const reconcileOpts =
    ctx.schedule_id != null
      ? {
          scheduleId: ctx.schedule_id,
          newMonthlyRentPaise: Number(ctx.monthly_rate_paise),
        }
      : undefined;

  const [bkBefore] = await db
    .select({
      id: bookings.id,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, BOOKING_CODE))
    .limit(1);

  console.log('\n=== AUTHORITATIVE CONTEXT ===');
  console.log({
    roomId: ctx.room_id,
    bedId: ctx.bed_id,
    effectiveFrom,
    monthlyRentPaise: ctx.monthly_rate_paise,
    monthlyDepositPaise: ctx.monthly_security_deposit_paise,
    appliedSchedule: ctx.schedule_id
      ? {
          scheduleId: ctx.schedule_id,
          effectiveFrom: ctx.schedule_effective_from,
          targetBedCount: ctx.target_bed_count,
          status: ctx.schedule_status,
        }
      : null,
    pricingFallbackEffectiveFrom: ctx.pricing_effective_from,
    reconcileOpts,
  });
  console.log('\n=== BOOKING BEFORE ===');
  console.log(bkBefore);

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --execute to apply reconcileRoomConfigurationDepositsForRoom.');
    await closeDb();
    return;
  }

  const result = await reconcileRoomConfigurationDepositsForRoom(
    ctx.room_id,
    effectiveFrom,
    SYSTEM_ROOM_CONFIGURATION_SESSION.adminId,
    reconcileOpts,
  );

  const [bkAfter] = await db
    .select({
      id: bookings.id,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, BOOKING_CODE))
    .limit(1);

  const depositSummary = await getDepositSummaryForBooking(bkAfter!.id);
  const money = await getBookingMoneyBalances(bkAfter!.id);

  console.log('\n=== RECONCILE RESULT ===');
  console.log(result);
  console.log('\n=== BOOKING AFTER ===');
  console.log(bkAfter);
  console.log('\n=== DEPOSIT SUMMARY ===');
  console.log(depositSummary);
  console.log('\n=== MONEY BALANCES ===');
  console.log({
    depositRequired: paiseToInr(money.deposit.requiredPaise),
    depositReceived: paiseToInr(money.deposit.receivedPaise),
    depositOutstanding: paiseToInr(money.deposit.outstandingPaise),
    depositRefundable: paiseToInr(money.deposit.refundablePaise),
    rentOutstanding: paiseToInr(money.rent.outstandingPaise),
  });

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
