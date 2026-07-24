/**
 * Repair APG-2026-0045 — archive premature checkout settlement while vacating still pending.
 *
 * Preserves V2 waterfall on archived settlement row; restores admin approval workflow visibility.
 *
 * Usage:
 *   npx tsx scripts/repair-premature-settlement-kunal.ts
 *   npx tsx scripts/repair-premature-settlement-kunal.ts --execute
 */
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { bookings, checkoutSettlements, vacatingRequests } from '@/src/db/schema';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { archivePrematureCheckoutSettlementForVacating } from '@/src/services/checkoutSettlement';

loadProductionAuditEnv();
requireDatabaseUrl('repair-premature-settlement-kunal.ts');

const BOOKING_CODE = 'APG-2026-0045';
const VACATING_ID = 'fca558dd-c40e-4491-9275-0069401c3808';
const SETTLEMENT_ID = '95e93de1-1b6a-40cd-bdfa-6a4b7238dea4';
const SYSTEM_ADMIN = '00000000-0000-4000-8000-000000000001';

async function main() {
  const execute = process.argv.includes('--execute');

  const [booking] = await db
    .select({ id: bookings.id, depositDuePaise: bookings.depositDuePaise })
    .from(bookings)
    .where(eq(bookings.bookingCode, BOOKING_CODE))
    .limit(1);
  if (!booking) {
    console.error('Booking not found:', BOOKING_CODE);
    process.exit(1);
  }

  const [vr] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, VACATING_ID))
    .limit(1);

  const [cs] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, SETTLEMENT_ID))
    .limit(1);

  const balances = await getBookingMoneyBalances(booking.id);

  console.log('═'.repeat(72));
  console.log(`Kunal premature settlement repair — ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log('═'.repeat(72));
  console.log('Vacating:', vr?.id, 'status:', vr?.status);
  console.log('Settlement:', cs?.id, 'status:', cs?.status);
  console.log('totalRefundPaise (V2):', cs?.totalRefundPaise);
  console.log('depositDuePaise:', booking.depositDuePaise, 'balances:', balances);

  if (!vr) {
    console.error('Vacating row not found:', VACATING_ID);
    process.exit(1);
  }

  if (vr.status !== 'pending') {
    console.log(
      `\nVacating is already "${vr.status}" — premature pending repair not needed.`,
    );
    if (cs && cs.status !== 'archived') {
      console.log('Active settlement still present:', cs.id, cs.status);
    } else {
      console.log('No active settlement on this vacating request.');
    }
    await closeDb();
    return;
  }

  if (!cs || cs.status === 'archived') {
    console.log('No active settlement to archive — already repaired or missing.');
    await closeDb();
    return;
  }

  if (!execute) {
    console.log('\nWould archive settlement and reopen vacating approval workflow.');
    console.log('Re-run with --execute to apply.');
    await closeDb();
    return;
  }

  const result = await archivePrematureCheckoutSettlementForVacating({
    vacatingRequestId: VACATING_ID,
    adminId: SYSTEM_ADMIN,
    reason: `Repair ${BOOKING_CODE} — settlement created before vacating approval (2026-07-23)`,
  });

  if (!result.ok) {
    console.error('Repair failed:', result.error);
    process.exit(1);
  }

  console.log('Archived settlement:', result.archivedSettlementId);
  console.log('Done — Kunal should appear in Operations pending move-out queue.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
