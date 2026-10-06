/* eslint-disable no-console */
/** Read-only: verify refundable-now ceilings for a booking code. */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-refundable-now');

import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { getResidentRefundableNowForBooking } from '../src/lib/billing/residentRefundableNow';
import { paiseToInr } from '../src/lib/format';

const CODE = process.argv[2] ?? 'APG-2026-0112';

async function main() {
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, CODE)).limit(1);
  if (!bk) throw new Error(`Booking ${CODE} not found`);
  const refundable = await getResidentRefundableNowForBooking({
    customerId: bk.customerId,
    bookingId: bk.id,
  });
  console.log(JSON.stringify({ bookingCode: CODE, refundable }, null, 2));
  if (refundable) {
    console.log('\nHuman:');
    console.log('  Required deposit locked:', paiseToInr(refundable.requiredDepositLockedPaise));
    console.log('  Prepaid rent refundable now:', paiseToInr(refundable.prepaidRentRefundableNowPaise));
    console.log('  Deposit excess refundable now:', paiseToInr(refundable.depositRefundableNowPaise));
    console.log('  Total refundable now:', paiseToInr(refundable.totalRefundableNowPaise));
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
