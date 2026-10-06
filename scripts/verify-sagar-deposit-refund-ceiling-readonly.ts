/* eslint-disable no-console */
/** Read-only: verify deposit refund ceiling for a booking code. */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-deposit-refund-ceiling');

import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { getDepositRefundCeilingForBooking } from '../src/lib/deposits/depositRefundCeiling';
import { getResidentCreditBalance, getLatestResidentCreditReason } from '../src/services/residentCreditLedger';
import { getDepositRefundSettlementPreview } from '../src/lib/deposits/depositRefundSettlementPreview';
import { computeDepositCheckoutEstimatePaise } from '../src/lib/billing/residentCreditWalletPresentation';
import { paiseToInr } from '../src/lib/format';

const CODE = process.argv[2] ?? 'APG-2026-0112';

async function main() {
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, CODE)).limit(1);
  if (!bk) throw new Error(`Booking ${CODE} not found`);
  const ceiling = await getDepositRefundCeilingForBooking(bk.id);
  const credit = await getResidentCreditBalance(bk.customerId);
  const creditReason = await getLatestResidentCreditReason(bk.customerId);
  const settlementPreview = await getDepositRefundSettlementPreview(bk.id);
  const checkoutDepositEstimate = ceiling
    ? computeDepositCheckoutEstimatePaise({
        depositRefundableExcessPaise: ceiling.refundableDepositPaise,
        electricityOutstandingPaise: settlementPreview?.electricityAdjustmentPaise ?? 0,
      })
    : null;
  console.log(
    JSON.stringify(
      {
        bookingCode: CODE,
        ceiling,
        rentCreditPaise: credit,
        rentCreditReason: creditReason,
        settlementPreviewRefundAmountPaise: settlementPreview?.refundAmountPaise ?? null,
        walletCheckoutDepositEstimatePaise: checkoutDepositEstimate,
      },
      null,
      2,
    ),
  );
  if (ceiling) {
    console.log('\nHuman:');
    console.log('  Held:', paiseToInr(ceiling.heldPaise));
    console.log('  Required:', paiseToInr(ceiling.requiredPaise));
    console.log('  Refundable deposit:', paiseToInr(ceiling.refundableDepositPaise));
    console.log('  Max request:', paiseToInr(ceiling.availableToRequestPaise));
    console.log('  Rent credit (separate):', paiseToInr(credit));
    if (creditReason) console.log('  Rent credit reason:', creditReason);
    if (checkoutDepositEstimate != null) {
      console.log('  Est. deposit after electricity:', paiseToInr(checkoutDepositEstimate));
    }
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
