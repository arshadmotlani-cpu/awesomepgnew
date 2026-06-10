/* eslint-disable no-console */
/**
 * Verifies the hold-expiry sweeper.
 *
 *   1. createBooking() (customer)         → pending_payment + hold
 *   2. Backdate hold_expires_at to "now - 1 minute"
 *   3. releaseExpiredHolds()              → reservations 'cancelled',
 *                                            booking 'cancelled'
 *   4. releaseExpiredHolds() again        → 0 work (idempotent)
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bedReservations, beds, bookings } from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import { releaseExpiredHolds } from '../src/services/bookingLifecycle';

function ok(label: string) {
  console.log(`  \u2713 ${label}`);
}
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

async function main() {
  console.log('Phase 4 verification — hold-expiry sweeper');

  const bedRow = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(1);
  if (bedRow.length === 0) fail('no available beds in DB');

  // Random jitter so reruns of this script don't keep colliding with prior runs.
  const today = new Date();
  const jitterDays = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (1100 + jitterDays) * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 10 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log('\n[1] createBooking');
  const created = await createBooking({
    bedIds: [bedRow[0].id],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'daily',
    customer: {
      fullName: 'Phase4 ExpiryBot',
      email: 'phase4-expiry@example.com',
      phone: '+919999000333',
      gender: 'other',
    },
    notes: 'Phase 4 verify-hold-expiry',
  });
  if (!created.ok) fail('createBooking failed', created);
  ok(`booking ${created.bookingCode} pending_payment`);

  console.log('\n[2] backdate hold_expires_at to past');
  await db
    .update(bedReservations)
    .set({ holdExpiresAt: new Date(Date.now() - 60 * 1000) })
    .where(
      and(
        eq(bedReservations.bookingId, created.bookingId),
        eq(bedReservations.status, 'hold'),
      ),
    );
  ok('hold_expires_at backdated by 60s');

  console.log('\n[3] releaseExpiredHolds');
  const first = await releaseExpiredHolds();
  if (first.reservationsReleased < 1) {
    fail('expected at least 1 reservation released', first);
  }
  if (!first.cancelledCodes.includes(created.bookingCode)) {
    fail(
      `expected ${created.bookingCode} to be in cancelledCodes`,
      first.cancelledCodes,
    );
  }
  ok(
    `released ${first.reservationsReleased} reservation(s), cancelled ${first.bookingsCancelled} booking(s)`,
  );

  const [b] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId));
  if (b?.status !== 'cancelled') fail(`expected status=cancelled, got "${b?.status}"`);
  ok('booking flipped to cancelled');

  console.log('\n[4] second sweep — should be a no-op');
  const second = await releaseExpiredHolds();
  if (second.reservationsReleased !== 0 || second.bookingsCancelled !== 0) {
    fail('second sweep should be a no-op', second);
  }
  ok('idempotent: second sweep released 0');

  console.log('\n→ Phase 4 hold-expiry sweeper: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-hold-expiry crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
