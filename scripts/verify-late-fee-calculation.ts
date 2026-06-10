/* eslint-disable no-console */
/**
 * Phase 5.5 — late fee accrual verification.
 *
 * Drives `projectInvoice()` against a real invoice row at several
 * synthetic "today" points and asserts the dashboard would report:
 *
 *   - through the 5th: status=pending, late fee = 0
 *   - day 6 (1st overdue day): late fee = 1% of rent
 *   - day 30+ overdue: late fee = N% of rent (linear, not compounded)
 *   - after payment: late_fee_locked_paise frozen at payment-time value
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { beds, rentInvoices } from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import { recordPaymentSuccess } from '../src/services/bookingLifecycle';
import {
  generateRentInvoicesForMonth,
  projectInvoice,
  recordRentPaymentSuccess,
} from '../src/services/rentInvoices';
import { isBedAvailable } from '../src/services/availability';
import { computeLateFee, firstOfMonth } from '../src/services/billing';

function ok(label: string) { console.log(`  \u2713 ${label}`); }
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
    .limit(64);
  for (const c of candidates) {
    if (await isBedAvailable({ bedId: c.id, startDate: start, endDate: end })) return c.id;
  }
  return fail('no free bed for the test window');
}

async function main() {
  console.log('Phase 5.5 verification — late-fee calculation');

  // ───────────────────────────────────────────────────────────────────────
  // Phase A: pure-math sanity (mirrors the spec example)
  // ───────────────────────────────────────────────────────────────────────
  console.log('\n[A] pure-math spec example: rent=₹6,000 → +₹60/day after grace');
  const fee0 = computeLateFee({ rentPaise: 600000, billingMonth: '2026-06-01', today: '2026-06-05' });
  if (fee0 !== 0) fail(`grace day expected 0, got ${fee0}`);
  ok('day 5 (grace): late fee = 0');

  const fee1 = computeLateFee({ rentPaise: 600000, billingMonth: '2026-06-01', today: '2026-06-06' });
  if (fee1 !== 6000) fail(`day 6 expected 6000 (₹60), got ${fee1}`);
  ok('day 6 (1st overdue): late fee = ₹60');

  const fee30 = computeLateFee({ rentPaise: 600000, billingMonth: '2026-06-01', today: '2026-07-05' });
  if (fee30 !== 180000) fail(`day 30 overdue expected 180000 (₹1,800), got ${fee30}`);
  ok('day 30 overdue: late fee = ₹1,800 (linear, not compounded)');

  // ───────────────────────────────────────────────────────────────────────
  // Phase B: integration — projectInvoice() applied to a real row
  // ───────────────────────────────────────────────────────────────────────
  console.log('\n[B] integration — project a real invoice at several "today" points');
  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (60 + jitter) * 86400_000);
  const end = new Date(start.getTime() + 62 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const bedId = await pickFreeBed(start, end);
  const booked = await createBooking({
    bedIds: [bedId],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase5.5 LateBot',
      email: 'phase55-latebot@example.com',
      phone: '+919999000777',
      gender: 'other',
    },
  });
  if (!booked.ok) fail('createBooking failed', booked);
  await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_late_pay_${Date.now()}`,
    amountPaise: booked.totalPaise,
    bookingCode: booked.bookingCode,
  });

  const month = firstOfMonth(start);
  const gen = await generateRentInvoicesForMonth({ billingMonth: month });
  if (gen.invoicesCreated === 0) fail('generator created 0 invoices', gen);

  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, booked.bookingId),
        eq(rentInvoices.billingMonth, month),
      ),
    )
    .limit(1);
  if (!invoice) fail('invoice not found');
  ok(`invoice ${invoice.invoiceNumber} for ${invoice.rentPaise} paise`);

  // Project at the 5th (grace) → fee 0
  const project5 = projectInvoice(invoice, fmt(new Date(start.getTime() + 4 * 86400_000)));
  // Note: dueDate = 5th of billing month. Let's compute "5th of billing month":
  const fifth = new Date(invoice.dueDate);
  const sixth = new Date(fifth.getTime() + 1 * 86400_000);
  const dayPlus30 = new Date(fifth.getTime() + 30 * 86400_000);

  const projG = projectInvoice(invoice, fmt(fifth));
  if (projG.accruedLateFeePaise !== 0) fail(`grace day fee should be 0, got ${projG.accruedLateFeePaise}`);
  if (projG.effectiveStatus !== 'pending') fail(`expected pending, got ${projG.effectiveStatus}`);
  ok('on grace day (5th): pending, fee=0');
  void project5; // silence unused warning

  const proj6 = projectInvoice(invoice, fmt(sixth));
  if (proj6.effectiveStatus !== 'overdue') fail(`expected overdue, got ${proj6.effectiveStatus}`);
  const expectedFee1 = Math.floor(invoice.rentPaise / 100);
  if (proj6.accruedLateFeePaise !== expectedFee1) {
    fail(`day 6 fee expected ${expectedFee1}, got ${proj6.accruedLateFeePaise}`);
  }
  if (proj6.outstandingPaise !== invoice.rentPaise + expectedFee1) {
    fail(`day 6 outstanding expected ${invoice.rentPaise + expectedFee1}, got ${proj6.outstandingPaise}`);
  }
  ok(`day 6 (1st overdue): overdue, fee=${expectedFee1}, outstanding=${proj6.outstandingPaise}`);

  const proj30 = projectInvoice(invoice, fmt(dayPlus30));
  // Spec: linear (NOT compounded) — 1% × N days of the original principal.
  // We compute floor(rent * N / 100) to apply rounding once at the end,
  // which is fairer to the resident than rounding per-day.
  const expectedFee30 = Math.floor((invoice.rentPaise * 30) / 100);
  if (proj30.accruedLateFeePaise !== expectedFee30) {
    fail(`day 30 overdue fee expected ${expectedFee30}, got ${proj30.accruedLateFeePaise}`);
  }
  ok(`day 30 overdue: fee=${proj30.accruedLateFeePaise} (linear; 30 × 1% of rent)`);

  // ───────────────────────────────────────────────────────────────────────
  // Phase C: late-fee snapshot freezes on payment
  // ───────────────────────────────────────────────────────────────────────
  console.log('\n[C] late-fee locked on payment (snapshotted)');
  const payResult = await recordRentPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `verify_late_inv_${Date.now()}`,
    amountPaise: invoice.rentPaise,
    invoiceId: invoice.id,
  });
  if (!payResult.ok) fail('payment failed', payResult);
  const [reread] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoice.id))
    .limit(1);
  if (reread.status !== 'paid') fail(`expected paid, got ${reread.status}`);
  if (reread.lateFeeLockedPaise == null) fail('lateFeeLockedPaise should be set');
  ok(`paid: lateFeeLockedPaise=${reread.lateFeeLockedPaise} frozen on payment`);

  // After payment, projecting at any "today" returns 0 outstanding +
  // the locked fee — never re-derives.
  const projAfter = projectInvoice(reread, fmt(new Date(Date.now() + 999 * 86400_000)));
  if (projAfter.effectiveStatus !== 'paid') fail(`post-payment expected paid, got ${projAfter.effectiveStatus}`);
  if (projAfter.outstandingPaise !== 0) fail(`post-payment outstanding should be 0, got ${projAfter.outstandingPaise}`);
  if (projAfter.accruedLateFeePaise !== reread.lateFeeLockedPaise) {
    fail(`projection should mirror locked late fee, got ${projAfter.accruedLateFeePaise} vs ${reread.lateFeeLockedPaise}`);
  }
  ok('post-payment projection: paid, outstanding=0, accruedLateFee = lockedFee');

  console.log('\nAll late-fee assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-late-fee-calculation failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
