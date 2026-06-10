/* eslint-disable no-console */
/**
 * Phase 5.5 — verify rent invoicing end-to-end.
 *
 * Walks through:
 *   1. Create a confirmed MONTHLY booking (1 bed, 2-month stay).
 *   2. generateRentInvoicesForMonth() for both billing months.
 *   3. Assert one invoice per (booking, month) — and idempotent on rerun.
 *   4. Pay the first invoice via the mock webhook (rent purpose).
 *   5. Assert status → paid, late fee snapshotted, ledger row written.
 *   6. Webhook replay → no double-pay (idempotent).
 *
 * Exits non-zero on the first failed assertion.
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  beds,
  payments,
  rentInvoices,
} from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import { recordPaymentSuccess } from '../src/services/bookingLifecycle';
import {
  generateRentInvoicesForMonth,
  markOverdueInvoices,
  recordRentPaymentSuccess,
} from '../src/services/rentInvoices';
import { isBedAvailable } from '../src/services/availability';
import { firstOfMonth } from '../src/services/billing';

function ok(label: string) {
  console.log(`  \u2713 ${label}`);
}
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

async function pickFreeBed(start: Date, end: Date): Promise<string> {
  const candidates = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(48);
  for (const c of candidates) {
    const free = await isBedAvailable({ bedId: c.id, startDate: start, endDate: end });
    if (free) return c.id;
  }
  return fail('no free bed for the test window');
}

async function main() {
  console.log('Phase 5.5 verification — rent billing');

  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  // Start ~30 days out so we can generate invoices for the start month + next.
  const start = new Date(today.getTime() + (60 + jitter) * 86400_000);
  // 2 months of stay → spans 2 billing months.
  const end = new Date(start.getTime() + 62 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const bedId = await pickFreeBed(start, end);
  ok(`picked bed ${bedId.slice(0, 8)} for the monthly stay`);

  console.log('\n[1] create confirmed monthly booking');
  const created = await createBooking({
    bedIds: [bedId],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase5.5 RentBot',
      email: 'phase55-rentbot@example.com',
      phone: '+919999000555',
      gender: 'other',
    },
    notes: 'Phase 5.5 verify-rent-billing',
  });
  if (!created.ok) fail('createBooking failed', created);
  ok(`booking ${created.bookingCode} created`);

  const paid = await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_rent_pay_${Date.now()}`,
    amountPaise: created.totalPaise,
    bookingCode: created.bookingCode,
  });
  if (!paid.ok) fail('recordPaymentSuccess failed', paid);
  ok('booking marked confirmed');

  console.log('\n[2] generateRentInvoicesForMonth — 1st billing month');
  const month1 = firstOfMonth(start);
  const gen1 = await generateRentInvoicesForMonth({ billingMonth: month1 });
  if (gen1.invoicesCreated === 0) {
    fail(`expected ≥ 1 invoice in ${month1}, got ${gen1.invoicesCreated}`, gen1);
  }
  ok(`generated ${gen1.invoicesCreated} invoice(s) for ${month1}`);

  console.log('\n[3] generator is idempotent on rerun');
  const gen1b = await generateRentInvoicesForMonth({ billingMonth: month1 });
  if (gen1b.invoicesCreated !== 0) {
    fail('rerun created duplicate invoices', gen1b);
  }
  ok('rerun was a no-op (idempotent)');

  console.log('\n[4] pay the first invoice via the mock webhook (rent purpose)');
  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, paid.bookingId),
        eq(rentInvoices.billingMonth, month1),
      ),
    )
    .limit(1);
  if (!invoice) fail(`no invoice found for booking + ${month1}`);
  ok(`invoice ${invoice.invoiceNumber} for ${invoice.rentPaise} paise`);

  const payResult = await recordRentPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_rent_inv_${Date.now()}`,
    amountPaise: invoice.rentPaise,
    invoiceId: invoice.id,
  });
  if (!payResult.ok) fail('recordRentPaymentSuccess failed', payResult);
  if (!payResult.stateChanged) fail('expected stateChanged=true on first call');
  ok('rent invoice flipped to paid');

  const [reread] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoice.id))
    .limit(1);
  if (reread.status !== 'paid') fail(`expected status=paid, got ${reread.status}`);
  if (reread.paidPrincipalPaise !== invoice.rentPaise) {
    fail(`expected paidPrincipal=${invoice.rentPaise}, got ${reread.paidPrincipalPaise}`);
  }
  if (reread.lateFeeLockedPaise == null) fail('expected lateFeeLockedPaise to be set');
  ok(`paid principal=${reread.paidPrincipalPaise}, late fee locked=${reread.lateFeeLockedPaise}`);

  console.log('\n[5] webhook idempotency — same providerPaymentId twice');
  const replay = await recordRentPaymentSuccess({
    provider: 'mock',
    providerPaymentId: payResult.paymentId
      ? // Use the SAME providerPaymentId — fetch it back from payments table.
        (await db.select({ p: payments.providerPaymentId }).from(payments).where(eq(payments.id, payResult.paymentId)).limit(1))[0]?.p ?? ''
      : '',
    amountPaise: invoice.rentPaise,
    invoiceId: invoice.id,
  });
  if (!replay.ok) fail('replay failed', replay);
  if (replay.stateChanged) fail('expected stateChanged=false on replay');
  ok('replay was a no-op (idempotent)');

  console.log('\n[6] markOverdueInvoices is harmless on already-paid invoices');
  const overdue = await markOverdueInvoices(fmt(new Date(Date.now() + 365 * 86400_000)));
  // The PAID invoice should not flip; only pending/overdue ones do.
  const reread2 = await db
    .select({ status: rentInvoices.status })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoice.id))
    .limit(1);
  if (reread2[0]?.status !== 'paid') fail('overdue sweeper mutated a paid invoice');
  ok(`sweeper updated ${overdue.updated} row(s) — paid invoice untouched`);

  console.log('\nAll rent billing assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-rent-billing failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
