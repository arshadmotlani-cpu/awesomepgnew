/**
 * Verify production schema + that deposit ledger reads use deduction_category (no fallback).
 * Usage: DATABASE_URL=... npx tsx scripts/verify-deduction-category-prod.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { depositLedger } from '../src/db/schema';
import { fetchDepositLedgerEntriesForBooking } from '../src/services/deposits';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getRefundConsoleWorkspace } from '../src/services/refundConsole';
import { loadDepositExpressContext } from '../src/services/depositExpress';

async function main() {
  const cols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deposit_ledger'
    ORDER BY ordinal_position
  `);
  const names = cols.map((c) => String((c as { column_name: string }).column_name));
  const hasColumn = names.includes('deduction_category');
  console.log('deduction_category column present:', hasColumn);
  if (!hasColumn) process.exit(1);

  const [sample] = await db
    .select({ id: depositLedger.id, deductionCategory: depositLedger.deductionCategory })
    .from(depositLedger)
    .limit(1);
  console.log('direct Drizzle select with deductionCategory: ok', sample?.id ?? '(empty table)');

  const [booking] = await db.execute(sql`
    SELECT booking_id FROM deposit_ledger ORDER BY created_at DESC LIMIT 1
  `);
  const bookingId = (booking as { booking_id?: string } | undefined)?.booking_id;
  if (!bookingId) {
    console.log('no ledger rows to exercise — schema check only');
    return;
  }

  let fallbackUsed = false;
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (msg.includes('fetchDepositLedgerEntriesForBooking failed') && msg.includes('deduction_category')) {
      fallbackUsed = true;
    }
    originalError(...args);
  };

  const entries = await fetchDepositLedgerEntriesForBooking(bookingId);
  console.error = originalError;
  console.log('fetchDepositLedgerEntriesForBooking rows:', entries.length);
  console.log('fallback path triggered:', fallbackUsed);

  const summary = await getDepositSummaryForBooking(bookingId);
  console.log('getDepositSummaryForBooking collectedPaise:', summary?.collectedPaise ?? null);

  const refundWs = await getRefundConsoleWorkspace(bookingId);
  console.log('getRefundConsoleWorkspace wallet remaining:', refundWs?.wallet.remainingDepositPaise ?? null);

  const expressCtx = await loadDepositExpressContext(bookingId);
  console.log('loadDepositExpressContext remainingDue:', expressCtx?.remainingDuePaise ?? null);

  if (fallbackUsed) {
    console.error('FAIL: fallback still used after migration');
    process.exit(1);
  }
  console.log('✓ Production schema + primary ledger read path OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
