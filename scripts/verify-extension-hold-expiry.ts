/* eslint-disable no-console */
/**
 * Phase 5 hold-expiry verification.
 *
 * Walks through:
 *   1. createBooking + pay → confirmed booking
 *   2. requestExtension    → pending extension w/ hold reservations
 *   3. Hand-roll `hold_expires_at` to the past on the extension reservations
 *   4. releaseExpiredHolds() → extension reservations cancelled,
 *                              stay_extensions flipped pending → cancelled,
 *                              primary reservations untouched,
 *                              booking still confirmed.
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  stayExtensions,
} from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import {
  recordPaymentSuccess,
  releaseExpiredHolds,
} from '../src/services/bookingLifecycle';
import { requestExtension } from '../src/services/extension';
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
  // We need beds that are STRUCTURALLY available AND have no reservations
  // overlapping our extension window — the latter check rules out beds
  // that prior test runs reserved deep into the future.
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
  if (picked.length < n) {
    fail(
      `need ${n} beds free over [${windowStart.toISOString().slice(0, 10)}, ${windowEnd.toISOString().slice(0, 10)}), only found ${picked.length}`,
    );
  }
  return picked;
}

async function main() {
  console.log('Phase 5 verification — extension hold expiry');

  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (120 + jitter) * 86400_000);
  const end = new Date(start.getTime() + 10 * 86400_000);
  // Need beds free for the primary stay AND the would-be extension window.
  const windowEnd = new Date(end.getTime() + 5 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const bedIds = await pickFreeBeds(2, start, windowEnd);

  const created = await createBooking({
    bedIds,
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'daily',
    customer: {
      fullName: 'Phase5 HoldExp',
      email: 'phase5-holdexp@example.com',
      phone: '+919999000666',
      gender: 'other',
    },
  });
  if (!created.ok) fail('createBooking failed', created);
  const paid = await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `mock_pay_${created.bookingCode}`,
    providerOrderId: `mock_order_${created.bookingCode}`,
    amountPaise: created.totalPaise,
    currency: 'INR',
    bookingCode: created.bookingCode,
  });
  if (!paid.ok) fail('payment failed');
  ok(`booking ${created.bookingCode} set up + confirmed`);

  const newUntil = fmt(new Date(end.getTime() + 5 * 86400_000));
  const ext = await requestExtension({
    bookingCode: created.bookingCode,
    newUntilDate: newUntil,
    durationMode: 'daily',
    requestedBy: 'customer',
    actor: { kind: 'customer', customerId: null },
    customerPhone: '+919999000666',
  });
  if (!ext.ok) fail('extension request failed', ext);
  ok(`extension ${ext.extensionId} created (pending)`);

  // Force-expire the extension holds.
  const past = new Date(Date.now() - 60 * 1000);
  await db
    .update(bedReservations)
    .set({ holdExpiresAt: past, updatedAt: new Date() })
    .where(inArray(bedReservations.id, ext.newReservationIds));
  ok('hand-rolled hold_expires_at into the past');

  console.log('\n[3] releaseExpiredHolds()');
  const swept = await releaseExpiredHolds();
  if (swept.reservationsReleased < ext.newReservationIds.length) {
    fail(
      `expected at least ${ext.newReservationIds.length} reservations released, got ${swept.reservationsReleased}`,
      swept,
    );
  }
  if (swept.expiredExtensions < 1) {
    fail(`expected expiredExtensions >= 1, got ${swept.expiredExtensions}`, swept);
  }
  ok(
    `sweeper released ${swept.reservationsReleased} reservations + flipped ${swept.expiredExtensions} extensions`,
  );

  console.log('\n[4] state checks');
  const cancelledExtResvs = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(inArray(bedReservations.id, ext.newReservationIds));
  if (!cancelledExtResvs.every((r) => r.status === 'cancelled')) {
    fail('extension reservations not all cancelled', cancelledExtResvs);
  }
  ok('extension reservations → cancelled');

  const [extAfter] = await db
    .select({ status: stayExtensions.status })
    .from(stayExtensions)
    .where(eq(stayExtensions.id, ext.extensionId))
    .limit(1);
  if (extAfter.status !== 'cancelled') {
    fail(`extension row status ${extAfter.status}, expected cancelled`);
  }
  ok('stay_extensions row → cancelled');

  const primaries = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, created.bookingId),
        eq(bedReservations.kind, 'primary'),
      ),
    );
  if (!primaries.every((r) => r.status === 'active')) {
    fail('primary reservations should remain active', primaries);
  }
  ok('primary reservations untouched');

  const [bAfter] = await db
    .select({ status: bookings.status, expectedCheckoutDate: bookings.expectedCheckoutDate })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId))
    .limit(1);
  if (bAfter.status !== 'confirmed') {
    fail(`booking should remain confirmed, got ${bAfter.status}`);
  }
  if (bAfter.expectedCheckoutDate !== fmt(end)) {
    fail(
      `booking expected_checkout_date should NOT have moved (still ${fmt(end)}), got ${bAfter.expectedCheckoutDate}`,
    );
  }
  ok('booking still confirmed; expected_checkout_date unchanged');

  console.log('\n→ Phase 5 hold expiry: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-extension-hold-expiry crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
