/* eslint-disable no-console */
import 'dotenv/config';
import { closeDb, db } from '../src/db/client';
import { depositLedger, depositSettlements } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getUnifiedDepositView } from '../src/services/depositOperations';
import { depositAdminDisplayAmounts } from '../src/lib/deposits/unifiedDepositView';

async function main() {
  const rows = await db.execute<{
    id: string;
    booking_code: string;
    deposit_paise: number;
    deposit_due_paise: number;
    deposit_collection_status: string;
    full_name: string;
    phone: string;
  }>(sql`
    SELECT b.id, b.booking_code, b.deposit_paise, b.deposit_due_paise, b.deposit_collection_status,
           c.full_name, c.phone
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    WHERE c.phone LIKE '%7074754939%' OR b.booking_code = 'APG-2026-0013'
  `);

  console.log('BOOKINGS', JSON.stringify(rows, null, 2));
  const bookingId = rows[0]?.id;
  if (!bookingId) {
    console.log('No booking found');
    return;
  }

  const ledger = await db.select().from(depositLedger).where(eq(depositLedger.bookingId, bookingId));
  console.log('LEDGER', JSON.stringify(ledger, null, 2));

  const settlements = await db
    .select()
    .from(depositSettlements)
    .where(eq(depositSettlements.bookingId, bookingId));
  console.log('SETTLEMENTS', JSON.stringify(settlements, null, 2));

  const summary = await getDepositSummaryForBooking(bookingId);
  console.log('SUMMARY', JSON.stringify(summary, null, 2));

  const view = await getUnifiedDepositView(bookingId);
  console.log('UNIFIED', JSON.stringify(view, null, 2));

  if (view) {
    console.log(
      'DISPLAY',
      JSON.stringify(
        depositAdminDisplayAmounts({
          grossCollectedPaise: view.collectedPaise,
          grossDeductedPaise: view.deductedPaise,
          grossRefundedPaise: view.refundedPaise,
          grossRefundableBalancePaise: view.refundablePaise,
          requiredPaise: view.requiredPaise,
          depositDuePaise: view.depositDuePaise,
        }),
        null,
        2,
      ),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => closeDb());
