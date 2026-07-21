/**
 * Re-sync booking deposit_due_paise and rent_received_paise from ledger + invoices.
 * Dry-run by default; pass --apply to write.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { syncDepositCollectionFromLedger } from '../src/services/depositCollection';
import { syncBookingRentReceivedPaise } from '../src/services/bookingMoneyBalances';

const apply = process.argv.includes('--apply');

async function main() {
  const rows = await db
    .select({ id: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(
      inArray(bookings.status, ['confirmed', 'pending_payment', 'pending_approval']),
    );

  let driftCount = 0;
  for (const row of rows) {
    const before = await db
      .select({
        depositDuePaise: bookings.depositDuePaise,
        rentReceivedPaise: bookings.rentReceivedPaise,
      })
      .from(bookings)
      .where(eq(bookings.id, row.id))
      .limit(1);

    const balances = await getBookingMoneyBalances(row.id);
    if (!balances) continue;

    const depositDrift =
      (before[0]?.depositDuePaise ?? 0) !== balances.deposit.outstandingPaise;
    const rentDrift =
      (before[0]?.rentReceivedPaise ?? 0) !== balances.rent.receivedPaise;

    if (!depositDrift && !rentDrift) continue;
    driftCount += 1;
    console.log(
      `${row.bookingCode ?? row.id}: depositDue ${before[0]?.depositDuePaise} → ${balances.deposit.outstandingPaise}, rentReceived ${before[0]?.rentReceivedPaise} → ${balances.rent.receivedPaise}`,
    );

    if (apply) {
      await syncDepositCollectionFromLedger(row.id);
      await syncBookingRentReceivedPaise(row.id);
    }
  }

  console.log(
    apply
      ? `Synced ${driftCount} booking(s) with drift.`
      : `Found ${driftCount} booking(s) with drift (dry-run; pass --apply to write).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
