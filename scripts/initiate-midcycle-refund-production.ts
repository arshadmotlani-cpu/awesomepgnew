/* eslint-disable no-console */
/**
 * Preview or create mid-stay refund requests (prepaid rent + deposit excess) via canonical services.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/initiate-midcycle-refund-production.ts APG-2026-0112
 *   USE_PRODUCTION_DB=1 npx tsx scripts/initiate-midcycle-refund-production.ts APG-2026-0112 --execute --payout-qr-url='https://…'
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('initiate-midcycle-refund');

import { desc, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings, residentRequests } from '../src/db/schema';
import { getResidentRefundableNowForBooking } from '../src/lib/billing/residentRefundableNow';
import { paiseToInr } from '../src/lib/format';
import { submitResidentRefundNowRequest } from '../src/services/residentRequests';

const bookingCode = process.argv.find((a) => a.startsWith('APG-')) ?? process.argv[2];
const EXECUTE = process.argv.includes('--execute');
const payoutQrArg = process.argv.find((a) => a.startsWith('--payout-qr-url='));
const payoutQrUrl = payoutQrArg ? payoutQrArg.slice('--payout-qr-url='.length) : process.env.PAYOUT_QR_URL ?? null;

async function main() {
  if (!bookingCode) throw new Error('Pass booking code (e.g. APG-2026-0112)');

  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, bookingCode)).limit(1);
  if (!bk) throw new Error(`Booking ${bookingCode} not found`);

  const refundable = await getResidentRefundableNowForBooking({
    customerId: bk.customerId,
    bookingId: bk.id,
  });
  if (!refundable || refundable.totalRefundableNowPaise <= 0) {
    console.log('No refundable balance available.');
    await closeDb();
    return;
  }

  const open = await db
    .select()
    .from(residentRequests)
    .where(eq(residentRequests.bookingId, bk.id))
    .orderBy(desc(residentRequests.createdAt));

  const openRefund = open.filter(
    (r) =>
      (r.type === 'prepaid_rent_refund' || r.type === 'deposit_refund') &&
      ['submitted', 'under_review', 'approved'].includes(r.status),
  );

  console.log('\n=== REFUNDABLE (canonical) ===');
  console.log({
    bookingCode,
    requiredDepositLocked: paiseToInr(refundable.requiredDepositLockedPaise),
    prepaidRentRefundable: paiseToInr(refundable.prepaidRentRefundableNowPaise),
    depositExcessRefundable: paiseToInr(refundable.depositRefundableNowPaise),
    totalRefundable: paiseToInr(refundable.totalRefundableNowPaise),
    depositHeld: paiseToInr(refundable.deposit.heldPaise),
    depositRequired: paiseToInr(refundable.deposit.requiredPaise),
    depositReserved: paiseToInr(refundable.deposit.reservedPaise),
  });

  if (openRefund.length > 0) {
    console.log('\n=== OPEN REFUND REQUESTS (skip create) ===');
    for (const r of openRefund) {
      console.log({
        id: r.id,
        type: r.type,
        status: r.status,
        amount: paiseToInr(r.amountPaise ?? 0),
        finalRefund: r.finalRefundPaise != null ? paiseToInr(r.finalRefundPaise) : null,
      });
    }
    await closeDb();
    return;
  }

  if (!EXECUTE) {
    console.log('\nDry run. Re-run with --execute and --payout-qr-url=… to submit resident refund requests.');
    await closeDb();
    return;
  }

  if (!payoutQrUrl?.trim()) {
    throw new Error('Missing payout QR — pass --payout-qr-url=… or PAYOUT_QR_URL');
  }

  const result = await submitResidentRefundNowRequest({
    customerId: bk.customerId,
    bookingId: bk.id,
    requestedTotalPaise: refundable.totalRefundableNowPaise,
    payoutQrUrl: payoutQrUrl.trim(),
    notes: `Mid-stay excess refund — room change reconciliation (${bookingCode})`,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  const created = result.requests ?? (result.request ? [result.request] : []);
  console.log('\n=== CREATED REQUESTS ===');
  for (const r of created) {
    console.log({
      id: r.id,
      type: r.type,
      status: r.status,
      amount: paiseToInr(r.amountPaise ?? 0),
    });
  }

  const after = await getResidentRefundableNowForBooking({
    customerId: bk.customerId,
    bookingId: bk.id,
  });
  console.log('\n=== REFUNDABLE AFTER SUBMIT (pending reserved) ===');
  if (after) {
    console.log({
      prepaidAvailable: paiseToInr(after.prepaidRent.availableToRequestPaise),
      depositAvailable: paiseToInr(after.deposit.availableToRequestPaise),
      totalAvailable: paiseToInr(after.totalRefundableNowPaise),
    });
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
