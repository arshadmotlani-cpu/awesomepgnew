/* eslint-disable no-console */
/**
 * Verifies webhook idempotency end-to-end:
 *   1. createBooking (customer)
 *   2. POST the same `payment_succeeded` event to /api/webhooks/mock
 *      FIVE times in rapid succession (some serial, some parallel)
 *   3. Assert exactly ONE payment row exists, booking is confirmed,
 *      reservations are active.
 *
 * Requires the dev server to be running. Pass the base URL as the first
 * arg (e.g. `http://localhost:3001`); defaults to localhost:3000.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bedReservations, beds, bookings, payments } from '../src/db/schema';
import { createBooking } from '../src/services/booking';
import { signMockWebhookPayload } from '../src/lib/payments/mockWebhookAuth';

function ok(label: string) {
  console.log(`  \u2713 ${label}`);
}
function fail(label: string, extra?: unknown): never {
  console.error(`  \u2717 ${label}`);
  if (extra !== undefined) console.error('    ', extra);
  process.exit(1);
}

async function main() {
  const baseUrl = process.argv[2] ?? 'http://localhost:3000';
  console.log(`Phase 4 verification — webhook idempotency against ${baseUrl}`);

  // Health check the dev server first so we fail fast with a clear error.
  try {
    const probe = await fetch(`${baseUrl}/`, { cache: 'no-store' });
    if (!probe.ok) fail(`dev server unhealthy at ${baseUrl} (status ${probe.status})`);
  } catch (err) {
    fail(`could not reach ${baseUrl} — is npm run dev running?`, err);
  }
  ok('dev server reachable');

  const bedRow = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(1);
  if (bedRow.length === 0) fail('no available beds');

  // Push the stay far out + add a tiny jitter so reruns of this script
  // don't keep colliding with prior runs' reservations on the same bed.
  const today = new Date();
  const jitterDays = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (700 + jitterDays) * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log('\n[1] createBooking');
  const created = await createBooking({
    bedIds: [bedRow[0].id],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'monthly',
    customer: {
      fullName: 'Phase4 IdempotencyBot',
      email: 'phase4-idem@example.com',
      phone: '+919999000555',
      gender: 'other',
    },
  });
  if (!created.ok) fail('createBooking failed', created);
  ok(`booking ${created.bookingCode} created`);

  console.log('\n[2] fire SAME webhook 5 times (3 sequential, 2 parallel)');
  const event = {
    kind: 'payment_succeeded',
    providerPaymentId: `mock_pay_${created.bookingCode}_dup`,
    providerOrderId: `mock_order_${created.bookingCode}`,
    amountPaise: created.totalPaise,
    currency: 'INR',
    receipt: created.bookingCode,
  };
  const body = JSON.stringify(event);
  const post = () => {
    const signed = signMockWebhookPayload(body);
    return fetch(`${baseUrl}/api/webhooks/mock`, {
      method: 'POST',
      headers: signed.headers,
      body,
      cache: 'no-store',
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  };

  const r1 = await post();
  const r2 = await post();
  const r3 = await post();
  const [r4, r5] = await Promise.all([post(), post()]);
  const responses = [r1, r2, r3, r4, r5];
  for (const r of responses) {
    if (r.status !== 200) fail('webhook returned non-200', r);
  }
  const changed = responses.filter(
    (r) => typeof r.body === 'object' && r.body.ok && r.body.stateChanged,
  ).length;
  if (changed !== 1) {
    fail(`expected exactly 1 stateChanged=true response, got ${changed}`, responses.map((r) => r.body));
  }
  ok('exactly 1 stateChanged=true; the other 4 were no-ops');

  console.log('\n[3] DB-level assertions');
  const paymentRows = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(eq(payments.bookingId, created.bookingId));
  if (paymentRows.length !== 1) {
    fail(`expected 1 payment row, got ${paymentRows.length}`, paymentRows);
  }
  ok('exactly 1 payment row');

  const [b] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId));
  if (b?.status !== 'confirmed') fail(`expected confirmed, got "${b?.status}"`);
  ok('booking confirmed');

  const resv = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(eq(bedReservations.bookingId, created.bookingId));
  if (!resv.every((r) => r.status === 'active')) {
    fail('reservations not all active', resv);
  }
  ok(`${resv.length} reservation(s) active`);

  console.log('\n→ Phase 4 webhook idempotency: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-webhook-idempotency crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
