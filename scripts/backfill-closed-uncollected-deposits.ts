/**
 * Backfill closed_uncollected for completed bookings with outstanding deposit due.
 * Dry-run by default; pass --apply to write.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { bookings, checkoutSettlements } from '../src/db/schema';
import { closeUncollectedDepositDue } from '../src/services/depositCollection';

const apply = process.argv.includes('--apply');

async function main() {
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
      bookingStatus: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ['completed']),
        sql`coalesce(${bookings.depositDuePaise}, 0) > 0`,
        sql`${bookings.depositCollectionStatus} NOT IN ('closed_uncollected', 'waived', 'full')`,
      ),
    );

  let eligible = 0;
  for (const row of rows) {
    const [settlement] = await db
      .select({ status: checkoutSettlements.status })
      .from(checkoutSettlements)
      .where(
        and(
          eq(checkoutSettlements.bookingId, row.bookingId),
          inArray(checkoutSettlements.status, ['completed', 'refund_paid']),
        ),
      )
      .limit(1);

    if (!settlement) continue;
    eligible += 1;
    console.log(
      `${row.bookingCode ?? row.bookingId}: due ${row.depositDuePaise} paise, settlement ${settlement.status}`,
    );
    if (apply) {
      await closeUncollectedDepositDue({
        bookingId: row.bookingId,
        reason: 'Backfill — checkout completed with uncollected deposit',
      });
    }
  }

  console.log(
    apply
      ? `Closed ${eligible} booking(s) as closed_uncollected.`
      : `Found ${eligible} booking(s) eligible for closed_uncollected (dry-run).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
