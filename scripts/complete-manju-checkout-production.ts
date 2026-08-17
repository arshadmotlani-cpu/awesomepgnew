#!/usr/bin/env npx tsx
/**
 * Fix Manjusha Bhosale notice deduction + complete vacating occupancy.
 *
 * Audit: npx tsx scripts/complete-manju-checkout-production.ts
 * Execute: npx tsx scripts/complete-manju-checkout-production.ts --execute
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('complete-manju-checkout');

import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { vacatingRequests } from '@/src/db/schema';
import { paiseToInr } from '@/src/lib/format';
import { computeNoticeDeductionForBooking } from '@/src/services/noticeDeduction';
import { finalizeVacatingOccupancy } from '@/src/services/vacating';
import { getResidentFinancialAccount } from '@/src/services/residentFinancialEngine';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

const EXECUTE = process.argv.includes('--execute');
const BOOKING_ID = '04265c06-f998-4696-82d9-7b1934c7da35';
const CUSTOMER_ID = '3fe45658-bcf2-475a-8bd8-f3107a65e0c4';
const VACATING_ID = 'b33d0b2c-59f1-45f2-8fcb-f8da1775fa6a';
const SYSTEM_ADMIN = '69b20ae4-657a-45ea-912a-04b0665e38f8';

async function main() {
  const [vr] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, VACATING_ID))
    .limit(1);
  if (!vr) {
    console.error('Vacating request not found');
    process.exit(1);
  }

  const breakdown = await computeNoticeDeductionForBooking({
    bookingId: BOOKING_ID,
    noticeGivenDate: String(vr.noticeGivenDate),
    vacatingDate: String(vr.vacatingDate),
    monthlyRentPaise: vr.monthlyRentPaiseSnapshot,
  });

  console.log('\n=== Notice recompute ===');
  console.log({
    storedDeduction: paiseToInr(vr.deductionPaise),
    recomputedDeduction: paiseToInr(breakdown.noticeDeductionPaise),
    paidUntilDate: breakdown.paidUntilDate,
  });

  const financial = await getResidentFinancialAccount(CUSTOMER_ID);
  if (!financial) {
    console.error('No financial account');
    process.exit(1);
  }
  console.log('\n=== Outstanding (pre) ===', paiseToInr(financial.totals.outstandingPaise));

  const wallet = await getDepositSummaryForBooking(BOOKING_ID);
  console.log('Deposit refundable balance:', paiseToInr(wallet?.refundableBalancePaise ?? 0));

  if (EXECUTE) {
    if (breakdown.noticeDeductionPaise !== vr.deductionPaise) {
      console.log('\n→ Updating vacating notice snapshot to SSOT recompute…');
      await db
        .update(vacatingRequests)
        .set({
          deductionPaise: breakdown.noticeDeductionPaise,
          noticeShortfallDays: breakdown.missingNoticeDays,
          noticeRentCoveredDays: breakdown.noticeCoveredByPrepaidRent,
          noticeChargeableDays: breakdown.chargeableNoticeDays,
          noticeBreakdownJson: breakdown,
          depositRefundPaise: 0,
          updatedAt: new Date(),
        })
        .where(eq(vacatingRequests.id, VACATING_ID));
    }

    if (vr.status === 'approved') {
      console.log('\n→ finalizeVacatingOccupancy…');
      const result = await finalizeVacatingOccupancy({
        requestId: VACATING_ID,
        resolvedByAdminId: SYSTEM_ADMIN,
        depositRefundPaise: 0,
      });
      if (!result.ok) {
        console.error('finalizeVacatingOccupancy failed:', result);
        process.exit(1);
      }
      console.log('→ Occupancy finalized:', {
        deduction: paiseToInr(result.deductionPaise),
        depositRefundRecorded: paiseToInr(result.depositRefundPaise),
        futureRentCancelled: result.futureInvoicesCancelled,
        elecCancelled: result.electricityInvoicesCancelled,
      });
    } else {
      console.log('Vacating status:', vr.status, '(skip finalize)');
    }
  } else {
    console.log('\nDry run — pass --execute to apply.');
  }

  const financialAfter = await getResidentFinancialAccount(CUSTOMER_ID);
  console.log('\n=== Outstanding (post) ===', paiseToInr(financialAfter?.totals.outstandingPaise ?? 0));

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
