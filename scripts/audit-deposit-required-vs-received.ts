/**
 * Audit required vs received deposit per active booking.
 * Dry-run by default; pass --apply to sync deposit_due_paise from ledger.
 */
import { inArray } from 'drizzle-orm';
import { db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { syncDepositCollectionFromLedger } from '../src/services/depositCollection';

const apply = process.argv.includes('--apply');

async function main() {
  const rows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      depositCollectionStatus: bookings.depositCollectionStatus,
      depositPaise: bookings.depositPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .where(inArray(bookings.status, ['confirmed', 'completed']));

  let mismatchCount = 0;
  let closedUncollected = 0;

  for (const row of rows) {
    const balances = await getBookingMoneyBalances(row.id);
    if (!balances) continue;

    if (row.depositCollectionStatus === 'closed_uncollected') {
      closedUncollected += 1;
    }

    const expectedOutstanding = balances.deposit.outstandingPaise;
    const storedOutstanding = row.depositDuePaise ?? 0;
    const requiredVsReceivedDrift =
      row.depositPaise > 0 &&
      balances.deposit.receivedPaise > row.depositPaise &&
      row.depositCollectionStatus !== 'closed_uncollected';

    if (storedOutstanding !== expectedOutstanding || requiredVsReceivedDrift) {
      mismatchCount += 1;
      console.log(
        `${row.bookingCode ?? row.id}: required ${balances.deposit.requiredPaise}, received ${balances.deposit.receivedPaise}, outstanding stored ${storedOutstanding} vs ledger ${expectedOutstanding}, status ${row.depositCollectionStatus}`,
      );
      if (apply && storedOutstanding !== expectedOutstanding) {
        await syncDepositCollectionFromLedger(row.id);
      }
    }
  }

  console.log(
    `Audit complete — ${mismatchCount} mismatch(es), ${closedUncollected} closed_uncollected booking(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
