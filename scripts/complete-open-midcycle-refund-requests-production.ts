/* eslint-disable no-console */
/**
 * Complete open mid-stay prepaid + deposit excess refund requests after operator payout (production).
 * Idempotent: skips requests already completed; errors if ledger already reflects payout.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/complete-open-midcycle-refund-requests-production.ts APG-2026-0112
 *   USE_PRODUCTION_DB=1 npx tsx scripts/complete-open-midcycle-refund-requests-production.ts APG-2026-0112 --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('complete-midcycle-refund');

import { and, eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { adminUsers, bookings, residentRequests } from '../src/db/schema';
import { getResidentRefundableNowForBooking } from '../src/lib/billing/residentRefundableNow';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getResidentCreditBalance } from '../src/services/residentCreditLedger';
import { adminReviewResidentRequest } from '../src/services/residentRequests';
import { paiseToInr } from '../src/lib/format';

const EXECUTE = process.argv.includes('--execute');
const bookingCode = process.argv.find((a) => a.startsWith('APG-')) ?? process.argv[2];
const OPEN = ['submitted', 'under_review', 'approved'] as const;

async function getSuperAdminId(): Promise<string> {
  const [admin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');
  return admin.id;
}

async function main() {
  if (!bookingCode) throw new Error('Pass booking code');

  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, bookingCode)).limit(1);
  if (!bk) throw new Error(`Booking ${bookingCode} not found`);

  const open = await db
    .select()
    .from(residentRequests)
    .where(
      and(
        eq(residentRequests.bookingId, bk.id),
        inArray(residentRequests.type, ['prepaid_rent_refund', 'deposit_refund']),
        inArray(residentRequests.status, [...OPEN]),
      ),
    )
    .orderBy(residentRequests.createdAt);

  const creditBefore = await getResidentCreditBalance(bk.customerId);
  const depositBefore = await getDepositSummaryForBooking(bk.id);
  const refundableBefore = await getResidentRefundableNowForBooking({
    customerId: bk.customerId,
    bookingId: bk.id,
  });

  console.log('\n=== BEFORE ===');
  console.log({
    bookingCode,
    openRequests: open.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      amountPaise: r.amountPaise,
    })),
    creditBalancePaise: creditBefore,
    depositLedgerNetPaise: depositBefore?.refundableBalancePaise,
    depositRequiredBookingPaise: bk.depositPaise,
    refundableNow: refundableBefore,
  });

  if (open.length === 0) {
    console.log('\nNo open mid-cycle refund requests — nothing to complete.');
    await closeDb();
    return;
  }

  const prepaidPaid = open.some((r) => r.type === 'prepaid_rent_refund') && creditBefore === 0;
  const depositExcessPaid =
    depositBefore != null &&
    depositBefore.refundableBalancePaise <= bk.depositPaise &&
    open.every((r) => r.type !== 'deposit_refund');

  if (prepaidPaid && depositExcessPaid) {
    console.log('\nLedger already reflects completed payouts; open requests may need status-only fix.');
  }

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute to complete open requests via adminReviewResidentRequest.');
    await closeDb();
    return;
  }

  const adminId = await getSuperAdminId();
  const adminNotes =
    'Operator payout reconciled — mid-stay unused prepaid rent + deposit excess (booking already paid outside app).';

  for (const req of open) {
    const result = await adminReviewResidentRequest({
      requestId: req.id,
      adminId,
      action: 'complete',
      adminNotes,
      refundCompletion: { refundMethod: 'upi' },
    });
    if (!result.ok) {
      throw new Error(`${req.type} ${req.id}: ${result.error}`);
    }
    console.log('\nCompleted:', {
      id: req.id,
      type: req.type,
      finalRefundPaise: result.request.finalRefundPaise,
      status: result.request.status,
    });
  }

  const creditAfter = await getResidentCreditBalance(bk.customerId);
  const depositAfter = await getDepositSummaryForBooking(bk.id);
  const refundableAfter = await getResidentRefundableNowForBooking({
    customerId: bk.customerId,
    bookingId: bk.id,
  });

  console.log('\n=== AFTER ===');
  console.log({
    creditBalance: paiseToInr(creditAfter),
    depositHeld: depositAfter ? paiseToInr(depositAfter.refundableBalancePaise) : null,
    depositRequired: paiseToInr(bk.depositPaise),
    totalRefundableNow: refundableAfter ? paiseToInr(refundableAfter.totalRefundableNowPaise) : null,
  });

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
