/* eslint-disable no-console */
/**
 * Verifies cancellation policy tiers against a real DB-backed booking.
 *
 *   Creates one booking with check-in T+200 days, pays it, then runs
 *   cancelBooking() three times with `cancelAt` synthesised in each
 *   refund window (full / partial / none) and asserts the refund tier.
 *
 * Because cancelBooking() mutates booking status the first time, we do
 * three SEPARATE bookings (one per tier).
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { beds } from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import {
  cancelBooking,
  recordPaymentSuccess,
} from '../src/services/bookingLifecycle';

function ok(label: string) {
  console.log(`  \u2713 ${label}`);
}
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

// Start far in the future + jitter so reruns of this script don't clash
// with prior runs on the same beds.
const DAYS_OFFSET = 1500 + Math.floor(Math.random() * 365);
const STAY_NIGHTS = 30;
const fmt = (d: Date) => d.toISOString().slice(0, 10);

async function pickBed(taken: Set<string>): Promise<string> {
  const rows = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(40);
  for (const r of rows) if (!taken.has(r.id)) return r.id;
  fail('not enough free beds');
}

async function bookPayCancel(
  label: string,
  hoursBeforeCheckIn: number,
  expectedTier: 'full' | 'partial' | 'none',
  taken: Set<string>,
) {
  const checkIn = new Date(Date.now() + DAYS_OFFSET * 24 * 60 * 60 * 1000);
  const checkOut = new Date(checkIn.getTime() + STAY_NIGHTS * 24 * 60 * 60 * 1000);
  const bedId = await pickBed(taken);
  taken.add(bedId);

  const created = await createBooking({
    bedIds: [bedId],
    startDate: fmt(checkIn),
    endDate: fmt(checkOut),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase4 RefundBot',
      email: 'phase4-refund@example.com',
      phone: '+919999000444',
      gender: 'other',
    },
    notes: `Phase 4 verify-cancel-refund — ${label}`,
  });
  if (!created.ok) fail(`createBooking failed for ${label}`, created);

  const paid = await recordPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `mock_pay_${created.bookingCode}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    providerOrderId: null,
    amountPaise: created.totalPaise,
    bookingCode: created.bookingCode,
  });
  if (!paid.ok) fail(`mock pay failed for ${label}`, paid);

  // Synthesise the cancellation timestamp so we land in the desired tier.
  const cancelAt = new Date(checkIn.getTime() - hoursBeforeCheckIn * 60 * 60 * 1000);
  const cancelled = await cancelBooking({
    bookingCode: created.bookingCode,
    reason: `verify-cancel-refund: ${label}`,
    actor: { kind: 'customer', customerId: null },
    cancelAt,
  });
  if (!cancelled.ok) fail(`cancel failed for ${label}`, cancelled);
  if (cancelled.refund.tier !== expectedTier) {
    fail(
      `${label}: expected tier=${expectedTier}, got "${cancelled.refund.tier}" (hoursBefore=${cancelled.refund.hoursBeforeCheckIn})`,
    );
  }
  const refundedRupees = (cancelled.refund.totalRefundPaise / 100).toFixed(0);
  ok(
    `${label}: tier=${cancelled.refund.tier} · refund ₹${refundedRupees} (rent ${cancelled.refund.rentRefundPaise} + deposit ${cancelled.refund.depositRefundPaise})`,
  );
}

async function main() {
  console.log('Phase 4 verification — cancellation policy tiers');

  const taken = new Set<string>();
  await bookPayCancel('FULL (240h before)', 240, 'full', taken);
  await bookPayCancel('PARTIAL (72h before)', 72, 'partial', taken);
  await bookPayCancel('NONE (12h before)', 12, 'none', taken);

  console.log('\n→ Phase 4 cancellation policy tiers: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-cancel-refund crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
