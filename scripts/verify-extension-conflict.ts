/* eslint-disable no-console */
/**
 * Phase 5 conflict-path verification.
 *
 * Walks through:
 *   1. createBooking #A           → confirmed, holds bed for [start, end)
 *   2. createBooking #B           → confirmed, holds SAME bed for [end+0, end+7)
 *   3. requestExtension on #A     → must fail with kind='conflict'
 *      AND the conflict payload must name booking #B.
 *
 * This proves both the pre-flight conflict scan AND the GiST EXCLUDE
 * constraint guard against double-booking via extensions.
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bedReservations, beds, bookings } from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import { recordPaymentSuccess } from '../src/services/bookingLifecycle';
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

async function pickFreeBed(windowStart: Date, windowEnd: Date): Promise<string> {
  const rows = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(48);
  for (const r of rows) {
    const ok = await isBedAvailable({
      bedId: r.id,
      startDate: windowStart,
      endDate: windowEnd,
    });
    if (ok) return r.id;
  }
  fail(`no bed free in window [${windowStart.toISOString().slice(0, 10)}, ${windowEnd.toISOString().slice(0, 10)})`);
}

async function confirm(bookingId: string): Promise<void> {
  const [b] = await db
    .select({
      totalPaise: bookings.totalPaise,
      bookingCode: bookings.bookingCode,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `mock_pay_${b.bookingCode}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    providerOrderId: `mock_order_${b.bookingCode}`,
    amountPaise: b.totalPaise,
    currency: 'INR',
    bookingCode: b.bookingCode,
  });
}

async function main() {
  console.log('Phase 5 verification — extension conflict detection');

  const today = new Date();
  const jitter = Math.floor(Math.random() * 365);
  const startA = new Date(today.getTime() + (90 + jitter) * 86400_000);
  const endA = new Date(startA.getTime() + 5 * 86400_000);
  const startB = new Date(endA.getTime()); // immediately after #A
  const endB = new Date(startB.getTime() + 7 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const bedId = await pickFreeBed(startA, endB);
  ok(`picked bed ${bedId}`);

  console.log('\n[1] booking #A (will request the conflicting extension)');
  const a = await createBooking({
    bedIds: [bedId],
    startDate: fmt(startA),
    endDate: fmt(endA),
    durationMode: 'daily',
    customer: {
      fullName: 'Phase5 ConflictA',
      email: 'phase5-conflict-a@example.com',
      phone: '+919999000444',
      gender: 'other',
    },
  });
  if (!a.ok) fail('createBooking #A failed', a);
  await confirm(a.bookingId);
  ok(`#A ${a.bookingCode} confirmed`);

  console.log('\n[2] booking #B (occupies the dates #A wants to extend INTO)');
  const b = await createBooking({
    bedIds: [bedId],
    startDate: fmt(startB),
    endDate: fmt(endB),
    durationMode: 'daily',
    customer: {
      fullName: 'Phase5 ConflictB',
      email: 'phase5-conflict-b@example.com',
      phone: '+919999000555',
      gender: 'other',
    },
  });
  if (!b.ok) fail('createBooking #B failed', b);
  await confirm(b.bookingId);
  ok(`#B ${b.bookingCode} confirmed`);

  // Sanity: #B should now own an active reservation overlapping [endA, endB)
  const [conflictRow] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, b.bookingId),
        eq(bedReservations.bedId, bedId),
      ),
    )
    .limit(1);
  if (!conflictRow) fail('expected #B reservation not found');

  console.log('\n[3] extend #A into #B — must fail');
  const extResult = await requestExtension({
    bookingCode: a.bookingCode,
    newUntilDate: fmt(endB),
    durationMode: 'daily',
    requestedBy: 'customer',
    actor: { kind: 'customer', customerId: null },
    customerPhone: '+919999000444',
  });
  if (extResult.ok) fail('extension into a booked window should have failed', extResult);
  if (extResult.kind !== 'conflict') {
    fail(`expected kind=conflict, got ${extResult.kind}`, extResult);
  }
  ok('extension request was rejected with kind=conflict');
  if (extResult.conflicts.length === 0) fail('conflicts array should be non-empty');
  const namesB = extResult.conflicts.some(
    (c) => c.blockingBookingCode === b.bookingCode,
  );
  if (!namesB) {
    console.warn('    conflicts payload:', extResult.conflicts);
    fail(`expected conflict to reference booking ${b.bookingCode}`);
  }
  ok(`conflict payload correctly names blocking booking ${b.bookingCode}`);

  // No extension reservation should have been created.
  const orphans = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, a.bookingId),
        eq(bedReservations.kind, 'extension'),
      ),
    );
  if (orphans.length !== 0) {
    fail(`expected 0 extension reservations for #A, got ${orphans.length}`);
  }
  ok('no orphan extension reservations left behind');

  console.log('\n→ Phase 5 conflict detection: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-extension-conflict crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
