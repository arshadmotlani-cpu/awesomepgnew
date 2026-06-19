/* eslint-disable no-console */
/**
 * Diagnose deposit detail page loaders for one booking.
 * Usage: npx tsx scripts/diagnose-deposit-booking.ts [bookingId]
 */
import 'dotenv/config';
import { closeDb } from '../src/db/client';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { getDepositInvoiceForBooking } from '../src/services/depositInvoices';
import { getUnifiedDepositView } from '../src/services/depositOperations';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { bookings, customers, depositLedger, depositSettlements } from '../src/db/schema';

const bookingId = process.argv[2] ?? 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';

async function main() {
  console.log('Diagnosing booking', bookingId);

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  console.log('\n=== BOOKING ===');
  console.log(JSON.stringify(booking, null, 2));

  if (booking) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, booking.customerId))
      .limit(1);
    console.log('\n=== CUSTOMER ===');
    console.log(JSON.stringify(customer, null, 2));

    const ledger = await db
      .select()
      .from(depositLedger)
      .where(eq(depositLedger.bookingId, bookingId));
    console.log('\n=== LEDGER ===');
    console.log(JSON.stringify(ledger, null, 2));

    const settlements = await db
      .select()
      .from(depositSettlements)
      .where(eq(depositSettlements.bookingId, bookingId));
    console.log('\n=== SETTLEMENTS ===');
    console.log(JSON.stringify(settlements, null, 2));
  }

  console.log('\n=== getDepositSummaryForBooking ===');
  try {
    const summary = await getDepositSummaryForBooking(bookingId);
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('FAILED', err);
  }

  console.log('\n=== getDepositInvoiceForBooking ===');
  try {
    const invoice = await getDepositInvoiceForBooking(bookingId);
    console.log(JSON.stringify(invoice, null, 2));
  } catch (err) {
    console.error('FAILED', err);
  }

  console.log('\n=== getUnifiedDepositView ===');
  try {
    const view = await getUnifiedDepositView(bookingId);
    console.log(JSON.stringify(view, null, 2));
    if (view) {
      JSON.stringify(view);
      console.log('unifiedView JSON serialization: OK');
    }
  } catch (err) {
    console.error('FAILED', err);
    if (err instanceof Error) {
      console.error('stack:', err.stack);
    }
  }

  console.log('\n=== RSC client prop simulation ===');
  try {
    const { sanitizeUnifiedDepositView } = await import('../src/services/depositOperations');
    const { assertJsonSerializable } = await import('../src/lib/depositPageDebug');
    const view = await getUnifiedDepositView(bookingId);
    if (view) {
      const clean = sanitizeUnifiedDepositView(view);
      assertJsonSerializable('client_props_wallet', bookingId, { view: clean, isFrozen: false });
      console.log('client wallet props: OK');
    }
  } catch (err) {
    console.error('RSC PROP SIMULATION FAILED', err);
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
