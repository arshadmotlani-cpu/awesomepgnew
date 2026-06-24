/**
 * Sync deposit collection fields after ledger sign fix (APG-2026-0032 / 0036).
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createClient } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { syncDepositCollectionFromLedger } from '../src/services/depositCollection';
import { getDepositSummaryForBooking } from '../src/services/deposits';

const CODES = ['APG-2026-0032', 'APG-2026-0036'] as const;

async function main() {
  const { db, close } = createClient();
  try {
    for (const code of CODES) {
      const [booking] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.bookingCode, code))
        .limit(1);
      if (!booking) {
        console.error(`${code}: not found`);
        continue;
      }
      await syncDepositCollectionFromLedger(booking.id);
      const summary = await getDepositSummaryForBooking(booking.id);
      const [after] = await db
        .select({
          depositDuePaise: bookings.depositDuePaise,
          depositCollectionStatus: bookings.depositCollectionStatus,
        })
        .from(bookings)
        .where(eq(bookings.id, booking.id))
        .limit(1);
      console.log(
        JSON.stringify({
          code,
          bookingId: booking.id,
          refundableBalancePaise: summary?.refundableBalancePaise ?? null,
          collectedPaise: summary?.collectedPaise ?? null,
          deductedPaise: summary?.deductedPaise ?? null,
          depositDuePaise: after?.depositDuePaise ?? null,
          depositCollectionStatus: after?.depositCollectionStatus ?? null,
        }),
      );
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
