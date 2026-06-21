/* eslint-disable no-console */
/**
 * Reconcile Angatra Mandal (APG-2026-0013) deposit wallet to a single ₹4,500 collection.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/repair-angatra-deposit.ts          # audit only
 *   DATABASE_URL=... npx tsx scripts/repair-angatra-deposit.ts --execute
 */
import 'dotenv/config';
import { closeDb, db } from '../src/db/client';
import { eq, sql } from 'drizzle-orm';
import { bookings, customers } from '../src/db/schema';
import {
  executeReconcileDepositLedger,
  getDepositSummaryForBooking,
  planReconcileDepositLedger,
} from '../src/services/deposits';
import { getUnifiedDepositView } from '../src/services/depositOperations';
import { depositAdminDisplayAmounts } from '../src/lib/deposits/unifiedDepositView';

const BOOKING_ID = process.env.BOOKING_ID ?? 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';
const TARGET_REQUIRED_PAISE = 450_000;
const TARGET_COLLECTED_PAISE = 450_000;
const execute = process.argv.includes('--execute');

async function main() {
  const [row] = await db.execute<{
    id: string;
    booking_code: string;
    customer_id: string;
    full_name: string;
    phone: string;
    deposit_paise: number;
    deposit_due_paise: number;
  }>(sql`
    SELECT b.id, b.booking_code, b.customer_id, c.full_name, c.phone,
           b.deposit_paise, b.deposit_due_paise
    FROM bookings b
    JOIN customers c ON c.id = b.customer_id
    WHERE b.id = ${BOOKING_ID}::uuid
       OR b.booking_code = 'APG-2026-0013'
       OR c.phone LIKE '%7074754939%'
    LIMIT 1
  `);

  if (!row) {
    console.error('Booking not found for Angatra Mandal');
    process.exit(1);
  }

  console.log('Resident:', row.full_name, row.phone, row.booking_code);
  console.log('Booking:', row.id);
  console.log('Booking deposit_paise:', row.deposit_paise, 'due:', row.deposit_due_paise);

  const summaryBefore = await getDepositSummaryForBooking(row.id);
  console.log('\nLEDGER BEFORE:', JSON.stringify(summaryBefore?.entries ?? [], null, 2));
  console.log('Summary:', {
    collected: summaryBefore?.collectedPaise,
    deducted: summaryBefore?.deductedPaise,
    refunded: summaryBefore?.refundedPaise,
    refundable: summaryBefore?.refundableBalancePaise,
  });

  const plan = await planReconcileDepositLedger({
    bookingId: row.id,
    targetCollectedPaise: TARGET_COLLECTED_PAISE,
    targetRequiredPaise: TARGET_REQUIRED_PAISE,
  });
  console.log('\nRECONCILE PLAN:', JSON.stringify(plan, null, 2));

  if (!execute) {
    console.log('\nDry run — pass --execute to apply (deletes all ledger rows, inserts one collected ₹4,500).');
    return;
  }

  const result = await executeReconcileDepositLedger({
    bookingId: row.id,
    customerId: row.customer_id,
    targetCollectedPaise: TARGET_COLLECTED_PAISE,
    targetRequiredPaise: TARGET_REQUIRED_PAISE,
    adminId: '00000000-0000-0000-0000-000000000001',
    reason: 'Reconcile Angatra Mandal deposit — single ₹4,500 collection, remove duplicates/deductions',
  });

  console.log('\nEXECUTE RESULT:', JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }

  const summaryAfter = await getDepositSummaryForBooking(row.id);
  const view = await getUnifiedDepositView(row.id);
  const display = view
    ? depositAdminDisplayAmounts({
        grossCollectedPaise: summaryAfter?.collectedPaise ?? 0,
        grossDeductedPaise: summaryAfter?.deductedPaise ?? 0,
        grossRefundedPaise: summaryAfter?.refundedPaise ?? 0,
        grossRefundableBalancePaise: summaryAfter?.refundableBalancePaise ?? 0,
        requiredPaise: TARGET_REQUIRED_PAISE,
        depositDuePaise: 0,
      })
    : null;

  console.log('\nAFTER:', {
    ledgerRows: summaryAfter?.entries.length,
    collected: summaryAfter?.collectedPaise,
    refundable: summaryAfter?.refundableBalancePaise,
    display,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
