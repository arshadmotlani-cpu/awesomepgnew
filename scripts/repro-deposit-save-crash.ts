/* eslint-disable no-console */
/**
 * Reproduce save-deposit-corrections → page reload crash.
 * Usage: npx tsx scripts/repro-deposit-save-crash.ts [bookingId]
 */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings, depositLedger } from '../src/db/schema';
import { updateDepositSummaryAdmin } from '../src/services/depositOperations';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getDepositInvoiceForBooking } from '../src/services/depositInvoices';
import { getUnifiedDepositView, sanitizeUnifiedDepositView } from '../src/services/depositOperations';

async function findBookingId(): Promise<string | null> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT b.id
    FROM bookings b
    WHERE b.deposit_paise > 0
       OR EXISTS (SELECT 1 FROM deposit_ledger dl WHERE dl.booking_id = b.id)
    ORDER BY b.created_at DESC
    LIMIT 1
  `);
  return rows[0]?.id ?? null;
}

function trySerialize(label: string, value: unknown) {
  try {
    JSON.stringify(value);
    console.log(`[serialize] ${label}: OK`);
  } catch (err) {
    console.error(`[serialize] ${label}: FAILED`, err);
    throw err;
  }
}

function tryRenderMath(label: string, paise: unknown) {
  try {
    const s = (Number(paise) / 100).toString();
    console.log(`[render] ${label}: ${s}`);
  } catch (err) {
    console.error(`[render] ${label}: FAILED`, err);
    throw err;
  }
}

async function loadLikePage(bookingId: string) {
  const summary = await getDepositSummaryForBooking(bookingId);
  const invoice = await getDepositInvoiceForBooking(bookingId);
  const rawView = await getUnifiedDepositView(bookingId);
  const unifiedView = rawView ? sanitizeUnifiedDepositView(rawView) : null;
  return { summary, invoice, unifiedView };
}

async function main() {
  const bookingId = process.argv[2] ?? (await findBookingId());
  if (!bookingId) {
    console.error('No booking with deposit data found in DB');
    process.exit(1);
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      depositDuePaise: bookings.depositDuePaise,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    console.error('Booking not found', bookingId);
    process.exit(1);
  }

  console.log('=== BEFORE SAVE ===');
  console.log('booking', booking);
  const ledgerBefore = await db
    .select()
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId));
  console.log('ledger rows', ledgerBefore.length);

  const before = await loadLikePage(bookingId);
  console.log('summary', before.summary);
  console.log('unifiedView', before.unifiedView);
  if (before.unifiedView) {
    tryRenderMath('requiredPaise', before.unifiedView.requiredPaise);
    tryRenderMath('collectedPaise', before.unifiedView.collectedPaise);
    trySerialize('unifiedView', before.unifiedView);
  }

  const requiredPaise = booking.depositPaise;
  const collectedPaise = before.summary?.collectedPaise ?? booking.depositPaise;

  console.log('\n=== SAVE (updateDepositSummaryAdmin) ===');
  const result = await updateDepositSummaryAdmin({
    bookingId,
    customerId: booking.customerId,
    adminId: '00000000-0000-0000-0000-000000000001',
    requiredPaise,
    collectedPaise,
    reason: 'repro script save',
  });
  console.log('save result', result);
  if (!result.ok) {
    process.exit(1);
  }

  const [bookingAfter] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  console.log('\n=== AFTER SAVE BOOKING ROW ===');
  console.log(JSON.stringify(bookingAfter, null, 2));

  console.log('\n=== AFTER SAVE RELOAD ===');
  try {
    const after = await loadLikePage(bookingId);
    console.log('summary', after.summary);
    console.log('invoice', after.invoice);
    console.log('unifiedView', after.unifiedView);
    if (after.unifiedView) {
      tryRenderMath('requiredPaise', after.unifiedView.requiredPaise);
      tryRenderMath('collectedPaise', after.unifiedView.collectedPaise);
      trySerialize('unifiedView', after.unifiedView);
    }
    trySerialize('summary', after.summary);
    trySerialize('invoice', after.invoice);
    console.log('\n=== REPRO COMPLETE — NO CRASH ===');
  } catch (err) {
    console.error('\n=== REPRO CRASHED ===');
    console.error(err);
    if (err instanceof Error) {
      console.error('message:', err.message);
      console.error('stack:', err.stack);
    }
    process.exit(1);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
