/* eslint-disable no-console */
/**
 * End-to-end Phase 5 happy-path: stay extension.
 *
 * Walks through:
 *   1. createBooking() + recordPaymentSuccess()      → confirmed booking
 *   2. requestExtension() (customer w/ phone gate)   → pending extension w/ hold
 *   3. quoteExtension() (read-only)                  → matches request snapshot
 *   4. recordExtensionPaymentSuccess() (mock)        → paid + active + checkout rolls
 *   5. recordExtensionPaymentSuccess() again         → idempotent
 *   6. pricing_snapshot.extensions[] stamped         → audit trail intact
 *
 * Exits non-zero on the first failed assertion.
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  payments,
  stayExtensions,
} from '../src/db/schema';
import type { PricingSnapshot } from '../src/db/schema/bookings';
import { createBooking } from '../src/services/booking';
import {
  recordExtensionPaymentSuccess,
  recordPaymentSuccess,
} from '../src/services/bookingLifecycle';
import {
  quoteExtension,
  requestExtension,
} from '../src/services/extension';
import { isBedAvailable } from '../src/services/availability';

function ok(label: string) {
  console.log(`  \u2713 ${label}`);
}
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

async function pickFreeBeds(
  n: number,
  windowStart: Date,
  windowEnd: Date,
): Promise<string[]> {
  const candidates = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(48);
  const picked: string[] = [];
  for (const c of candidates) {
    const ok = await isBedAvailable({
      bedId: c.id,
      startDate: windowStart,
      endDate: windowEnd,
    });
    if (ok) picked.push(c.id);
    if (picked.length >= n) break;
  }
  if (picked.length < n) fail(`need ${n} free beds in window, found ${picked.length}`);
  return picked;
}

async function main() {
  console.log('Phase 5 verification — stay extension happy path');

  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (90 + jitter) * 86400_000);
  const end = new Date(start.getTime() + 14 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Pick beds that are free across the full extension window so reruns
  // don't trip the EXCLUDE constraint against prior test fixtures.
  const fullEnd = new Date(end.getTime() + 14 * 86400_000);
  const bedIds = await pickFreeBeds(2, start, fullEnd);
  ok(`picked ${bedIds.length} beds for the primary booking`);

  console.log('\n[1] createBooking + recordPaymentSuccess (set up a confirmed booking)');
  const created = await createBooking({
    bedIds,
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'daily',
    customer: {
      fullName: 'Phase5 ExtBot',
      email: 'phase5-extbot@example.com',
      phone: '+919999000333',
      gender: 'other',
    },
    notes: 'Phase 5 verify-extension-flow',
  });
  if (!created.ok) fail('createBooking failed', created);
  ok(`booking ${created.bookingCode} created`);

  const paid = await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `mock_pay_${created.bookingCode}`,
    providerOrderId: `mock_order_${created.bookingCode}`,
    amountPaise: created.totalPaise,
    currency: 'INR',
    bookingCode: created.bookingCode,
  });
  if (!paid.ok || !paid.stateChanged) fail('first payment should flip to confirmed', paid);
  ok('booking confirmed');

  // Confirm expected_checkout_date == end.
  const [b1] = await db
    .select({
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId))
    .limit(1);
  if (b1.expectedCheckoutDate !== fmt(end)) {
    fail(`expected checkout ${fmt(end)}, got ${b1.expectedCheckoutDate}`);
  }
  ok(`expected_checkout_date = ${b1.expectedCheckoutDate}`);

  console.log('\n[2] requestExtension (customer; phone-gated)');
  const newUntil = fmt(new Date(end.getTime() + 7 * 86400_000));

  // First: wrong phone → should be rejected.
  const wrongPhone = await requestExtension({
    bookingCode: created.bookingCode,
    newUntilDate: newUntil,
    durationMode: 'daily',
    requestedBy: 'customer',
    actor: { kind: 'customer', customerId: null },
    customerPhone: '+919999000999',
  });
  if (wrongPhone.ok) fail('extension with wrong phone should have been rejected', wrongPhone);
  if (wrongPhone.kind !== 'ownership_failed') {
    fail(`expected kind=ownership_failed, got ${wrongPhone.kind}`);
  }
  ok('wrong phone correctly rejected');

  // Now: correct phone.
  const reqOk = await requestExtension({
    bookingCode: created.bookingCode,
    newUntilDate: newUntil,
    durationMode: 'daily',
    requestedBy: 'customer',
    actor: { kind: 'customer', customerId: null },
    customerPhone: '+919999000333',
  });
  if (!reqOk.ok) fail('extension request failed', reqOk);
  ok(`extension ${reqOk.extensionId} created · quote ${reqOk.quote.totalPaise} paise`);
  if (reqOk.fromDate !== fmt(end)) fail('extension fromDate should equal booking checkout');
  if (reqOk.untilDate !== newUntil) fail('extension untilDate mismatch');

  // DB-level proof: extension reservations are in `hold` with kind='extension'.
  const extResvs = await db
    .select({
      status: bedReservations.status,
      kind: bedReservations.kind,
      parentReservationId: bedReservations.parentReservationId,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, created.bookingId),
        eq(bedReservations.kind, 'extension'),
      ),
    );
  if (extResvs.length !== bedIds.length) {
    fail(`expected ${bedIds.length} extension reservations, got ${extResvs.length}`);
  }
  if (!extResvs.every((r) => r.status === 'hold')) {
    fail('extension reservations not in hold', extResvs);
  }
  if (!extResvs.every((r) => r.parentReservationId != null)) {
    fail('extension reservations missing parent_reservation_id', extResvs);
  }
  ok('extension reservations: hold, kind=extension, parent linked');

  // Primary reservations should STILL be active (recordPaymentSuccess scoping fix).
  const primaryResvs = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, created.bookingId),
        eq(bedReservations.kind, 'primary'),
      ),
    );
  if (!primaryResvs.every((r) => r.status === 'active')) {
    fail('primary reservations should still be active', primaryResvs);
  }
  ok('primary reservations untouched (still active)');

  console.log('\n[3] quoteExtension matches requestExtension snapshot');
  const quote = await quoteExtension({
    bookingCode: created.bookingCode,
    newUntilDate: newUntil,
    durationMode: 'daily',
  });
  if (!quote.ok) fail('live quote failed', quote);
  if (quote.quote.totalPaise !== reqOk.quote.totalPaise) {
    fail(
      `live quote ${quote.quote.totalPaise} != request snapshot ${reqOk.quote.totalPaise}`,
    );
  }
  ok('live quote === request snapshot');

  console.log('\n[4] recordExtensionPaymentSuccess (mock)');
  const extPaymentId = `mock_pay_ext_${reqOk.extensionId.slice(0, 8)}`;
  const extPaid = await recordExtensionPaymentSuccess({
    provider: 'mock',
    providerPaymentId: extPaymentId,
    providerOrderId: `mock_order_ext_${reqOk.extensionId.slice(0, 8)}`,
    amountPaise: reqOk.quote.totalPaise,
    currency: 'INR',
    extensionId: reqOk.extensionId,
  });
  if (!extPaid.ok || !extPaid.stateChanged) {
    fail('extension payment should flip to paid', extPaid);
  }
  ok('extension payment recorded');

  // Verify state.
  const [extRow] = await db
    .select({ status: stayExtensions.status, paymentId: stayExtensions.paymentId })
    .from(stayExtensions)
    .where(eq(stayExtensions.id, reqOk.extensionId))
    .limit(1);
  if (extRow.status !== 'paid') fail(`extension status ${extRow.status}`);
  if (!extRow.paymentId) fail('extension paymentId not linked');
  ok('extension status = paid + paymentId linked');

  const extActives = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, created.bookingId),
        eq(bedReservations.kind, 'extension'),
      ),
    );
  if (!extActives.every((r) => r.status === 'active')) {
    fail('extension reservations should be active', extActives);
  }
  ok('extension reservations flipped to active');

  const [bAfter] = await db
    .select({ expectedCheckoutDate: bookings.expectedCheckoutDate })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId))
    .limit(1);
  if (bAfter.expectedCheckoutDate !== newUntil) {
    fail(`expected checkout to roll to ${newUntil}, got ${bAfter.expectedCheckoutDate}`);
  }
  ok(`expected_checkout_date rolled forward to ${bAfter.expectedCheckoutDate}`);

  console.log('\n[5] recordExtensionPaymentSuccess (idempotent replay)');
  const extReplay = await recordExtensionPaymentSuccess({
    provider: 'mock',
    providerPaymentId: extPaymentId,
    providerOrderId: null,
    amountPaise: reqOk.quote.totalPaise,
    extensionId: reqOk.extensionId,
  });
  if (!extReplay.ok) fail('replay should still be ok', extReplay);
  if (extReplay.stateChanged) fail('replay should NOT change state');
  ok('replay is a no-op (stateChanged=false)');

  const extPayments = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, created.bookingId),
        eq(payments.purpose, 'extension'),
      ),
    );
  if (extPayments.length !== 1) {
    fail(`expected 1 extension payment row, got ${extPayments.length}`);
  }
  ok('exactly 1 extension payment row after replay');

  console.log('\n[6] pricing_snapshot.extensions[] stamped');
  const [bSnap] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId))
    .limit(1);
  const snap = bSnap.pricingSnapshot as PricingSnapshot | null;
  if (!snap?.extensions || snap.extensions.length !== 1) {
    fail('pricing_snapshot.extensions[] should have 1 entry', snap);
  }
  const stamp = snap.extensions[0];
  if (stamp.extensionId !== reqOk.extensionId) fail('extension stamp id mismatch');
  if (stamp.untilDate !== newUntil) fail('extension stamp untilDate mismatch');
  if (stamp.amountPaise !== reqOk.quote.totalPaise) fail('extension stamp amount mismatch');
  ok('snapshot extensions[] entry present with the right shape');

  console.log('\n→ Phase 5 happy path: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-extension-flow crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
