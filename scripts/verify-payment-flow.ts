/* eslint-disable no-console */
/**
 * End-to-end Phase 4 happy-path verification.
 *
 * Walks through:
 *   1. createBooking() (customer path)  → expect pending_payment + hold
 *   2. recordPaymentSuccess() (mock)    → expect confirmed + active
 *   3. recordPaymentSuccess() again     → idempotent, stateChanged=false
 *   4. cancelBooking() at T-many-hours  → expect full-tier refund
 *
 * Exits non-zero on the first failed assertion. Cleans up by leaving the
 * test bookings in place (so the operator can inspect /admin/bookings).
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bedReservations, beds, bookings, payments } from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import {
  cancelBooking,
  recordPaymentSuccess,
} from '../src/services/bookingLifecycle';
import { isBedAvailable } from '../src/services/availability';

function ok(label: string) {
  console.log(`  \u2713 ${label}`);
}
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

async function pickFreeBeds(n: number, windowStart?: Date, windowEnd?: Date): Promise<string[]> {
  const rows = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(64);
  if (rows.length < n) fail(`Need at least ${n} available beds, found ${rows.length}`);
  // If a date window is supplied, prefer beds that are actually free
  // across it — repeated verify runs would otherwise collide on the
  // first few `status='available'` beds that accumulate reservations.
  if (windowStart && windowEnd) {
    const picked: string[] = [];
    for (const r of rows) {
      if (await isBedAvailable({ bedId: r.id, startDate: windowStart, endDate: windowEnd })) {
        picked.push(r.id);
        if (picked.length >= n) break;
      }
    }
    if (picked.length < n) {
      fail(`Need ${n} beds free across the test window, found ${picked.length}`);
    }
    return picked;
  }
  return rows.slice(0, n).map((r) => r.id);
}

async function main() {
  console.log('Phase 4 verification — payment + cancel happy path');

  // Push the stay far in the future so cancellation lands in the full-refund tier.
  // Jitter keeps reruns from colliding with prior runs' reservations on the same beds.
  const today = new Date();
  const jitterDays = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (90 + jitterDays) * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const bedIds = await pickFreeBeds(2, start, end);
  ok(`picked ${bedIds.length} available beds`);

  console.log('\n[1] createBooking (customer)');
  const created = await createBooking({
    bedIds,
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase4 PayBot',
      email: 'phase4-paybot@example.com',
      phone: '+919999000222',
      gender: 'other',
    },
    notes: 'Phase 4 verify-payment-flow',
  });
  if (!created.ok) fail('createBooking failed', created);
  if (created.status !== 'pending_payment') {
    fail(`expected status=pending_payment, got "${created.status}"`);
  }
  if (!created.holdExpiresAt) fail('expected holdExpiresAt to be set');
  ok(`booking ${created.bookingCode} created as pending_payment`);
  ok(`hold expires at ${created.holdExpiresAt.toISOString()}`);

  // DB-level proof: reservations are in `hold`.
  const reservedRows = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(eq(bedReservations.bookingId, created.bookingId));
  if (!reservedRows.every((r) => r.status === 'hold')) {
    fail('reservations not in `hold` state', reservedRows);
  }
  ok(`${reservedRows.length} reservations in 'hold' state`);

  console.log('\n[2] recordPaymentSuccess (mock provider)');
  const paymentEvent = {
    provider: 'mock' as const,
    providerPaymentId: `mock_pay_${created.bookingCode}_${Math.random().toString(36).slice(2, 8)}`,
    providerOrderId: `mock_order_${created.bookingCode}`,
    amountPaise: created.totalPaise,
    currency: 'INR',
    bookingCode: created.bookingCode,
    rawPayload: { synthetic: true },
  };
  const paid = await recordPaymentSuccess(paymentEvent);
  if (!paid.ok) fail('recordPaymentSuccess returned !ok', paid);
  if (!paid.stateChanged) fail('first webhook call should have stateChanged=true');
  ok(`payment recorded · stateChanged=${paid.stateChanged}`);

  const bookingAfterPay = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId))
    .limit(1);
  if (bookingAfterPay[0]?.status !== 'confirmed') {
    fail(`expected booking status=confirmed, got "${bookingAfterPay[0]?.status}"`);
  }
  ok('booking is now confirmed');

  const reservedAfterPay = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(eq(bedReservations.bookingId, created.bookingId));
  if (!reservedAfterPay.every((r) => r.status === 'active')) {
    fail('reservations did not flip to `active`', reservedAfterPay);
  }
  ok(`${reservedAfterPay.length} reservations flipped to 'active'`);

  console.log('\n[3] recordPaymentSuccess (idempotent replay)');
  const replayed = await recordPaymentSuccess(paymentEvent);
  if (!replayed.ok) fail('replay should still be ok', replayed);
  if (replayed.stateChanged) fail('replay should NOT change state');
  ok('duplicate webhook is a no-op (stateChanged=false)');

  const paymentRows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.bookingId, created.bookingId));
  if (paymentRows.length !== 1) {
    fail(`expected 1 payment row after replay, got ${paymentRows.length}`);
  }
  ok('exactly 1 payment row after replay');

  console.log('\n[4] cancelBooking (full-refund tier)');
  const cancelled = await cancelBooking({
    bookingCode: created.bookingCode,
    reason: 'Phase 4 verification — cancel after payment',
    actor: { kind: 'customer', customerId: null },
  });
  if (!cancelled.ok) fail('cancelBooking returned !ok', cancelled);
  if (cancelled.refund.tier !== 'full') {
    fail(`expected full refund tier, got "${cancelled.refund.tier}"`);
  }
  if (cancelled.refund.totalRefundPaise !== created.totalPaise) {
    fail(
      `expected refund = totalPaise (${created.totalPaise}), got ${cancelled.refund.totalRefundPaise}`,
    );
  }
  ok(`cancelled · refund tier=full · ₹${(cancelled.refund.totalRefundPaise / 100).toFixed(0)} returned`);

  const afterCancel = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId))
    .limit(1);
  if (!['cancelled', 'refunded'].includes(afterCancel[0]?.status ?? '')) {
    fail(`expected status=cancelled/refunded, got "${afterCancel[0]?.status}"`);
  }
  ok(`booking is now ${afterCancel[0]?.status}`);

  const paymentRowsAfter = await db
    .select({ purpose: payments.purpose, amountPaise: payments.amountPaise })
    .from(payments)
    .where(eq(payments.bookingId, created.bookingId));
  const refundRow = paymentRowsAfter.find((p) => p.purpose === 'refund');
  if (!refundRow) fail('no refund row created');
  if (refundRow.amountPaise >= 0) fail('refund row must have a negative amount');
  ok(`refund row recorded with amount ${refundRow.amountPaise}`);

  console.log('\n→ Phase 4 happy path: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-payment-flow crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
