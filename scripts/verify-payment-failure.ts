/* eslint-disable no-console */
/**
 * Phase 4 audit-fix verification — payment.failed lifecycle.
 *
 *   1. createBooking (customer)            → pending_payment + hold
 *   2. POST `payment_failed` to mock webhook → ledger row (failed),
 *                                              reservations cancelled,
 *                                              booking cancelled,
 *                                              audit log entry written
 *   3. Replay same failure                 → idempotent, stateChanged=false,
 *                                              no second payment row
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  payments,
} from '../src/db/schema';
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
  console.log(`Phase 4 audit — payment.failed flow against ${baseUrl}`);

  try {
    const probe = await fetch(`${baseUrl}/`, { cache: 'no-store' });
    if (!probe.ok) fail(`dev server unhealthy at ${baseUrl}`);
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

  // Far-future + jitter so reruns never collide.
  const today = new Date();
  const jitterDays = Math.floor(Math.random() * 365);
  const start = new Date(today.getTime() + (2500 + jitterDays) * 86400_000);
  const end = new Date(start.getTime() + 7 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  console.log('\n[1] createBooking');
  const created = await createBooking({
    bedIds: [bedRow[0].id],
    startDate: fmt(start),
    endDate: fmt(end),
    durationMode: 'daily',
    customer: {
      fullName: 'Phase4 FailBot',
      email: 'phase4-fail@example.com',
      phone: '+919999000999',
      gender: 'other',
    },
    notes: 'verify-payment-failure',
  });
  if (!created.ok) fail('createBooking failed', created);
  if (created.status !== 'pending_payment') {
    fail(`expected pending_payment, got ${created.status}`);
  }
  ok(`booking ${created.bookingCode} created as pending_payment`);

  console.log('\n[2] POST payment_failed event to mock webhook');
  const event = {
    kind: 'payment_failed',
    providerPaymentId: `mock_pay_${created.bookingCode}_failed`,
    providerOrderId: `mock_order_${created.bookingCode}`,
    receipt: created.bookingCode,
    reason: 'simulated insufficient funds',
  };
  const body = JSON.stringify(event);
  const signed = signMockWebhookPayload(body);
  const res = await fetch(`${baseUrl}/api/webhooks/mock`, {
    method: 'POST',
    headers: signed.headers,
    body,
    cache: 'no-store',
  });
  if (res.status !== 200) {
    const text = await res.text();
    fail(`expected 200, got ${res.status}: ${text}`);
  }
  const payload = (await res.json()) as { ok: boolean; stateChanged?: boolean };
  if (!payload.ok || payload.stateChanged !== true) {
    fail('first failure webhook should be ok=true stateChanged=true', payload);
  }
  ok('first failure webhook recorded with stateChanged=true');

  console.log('\n[3] DB-level assertions');
  const paymentRows = await db
    .select({
      id: payments.id,
      status: payments.status,
      purpose: payments.purpose,
      amountPaise: payments.amountPaise,
    })
    .from(payments)
    .where(eq(payments.bookingId, created.bookingId));
  if (paymentRows.length !== 1) {
    fail(`expected 1 payment row, got ${paymentRows.length}`, paymentRows);
  }
  if (paymentRows[0].status !== 'failed' || paymentRows[0].purpose !== 'booking') {
    fail(`expected status=failed purpose=booking, got ${JSON.stringify(paymentRows[0])}`);
  }
  ok('payments ledger has 1 failed-booking row');

  const [b] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId));
  if (b?.status !== 'cancelled') {
    fail(`expected booking status=cancelled, got "${b?.status}"`);
  }
  ok('booking flipped to cancelled');

  const resv = await db
    .select({ status: bedReservations.status })
    .from(bedReservations)
    .where(eq(bedReservations.bookingId, created.bookingId));
  if (!resv.every((r) => r.status === 'cancelled')) {
    fail('reservations not all cancelled', resv);
  }
  ok(`${resv.length} reservation(s) cancelled`);

  const auditRows = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.entityId, created.bookingId));
  const actions = auditRows.map((r) => r.action);
  if (!actions.includes('payment_failed')) {
    fail('audit_log missing payment_failed entry', actions);
  }
  ok(`audit_log includes payment_failed (${actions.join(', ')})`);

  console.log('\n[4] Replay same failure — must be idempotent');
  const replaySigned = signMockWebhookPayload(body);
  const res2 = await fetch(`${baseUrl}/api/webhooks/mock`, {
    method: 'POST',
    headers: replaySigned.headers,
    body,
    cache: 'no-store',
  });
  if (res2.status !== 200) fail(`replay returned ${res2.status}`);
  const body2 = (await res2.json()) as { ok: boolean; stateChanged?: boolean };
  if (!body2.ok || body2.stateChanged !== false) {
    fail('replay must have stateChanged=false', body2);
  }
  const paymentRowsAfter = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.bookingId, created.bookingId));
  if (paymentRowsAfter.length !== 1) {
    fail(`replay created a duplicate ledger row (now ${paymentRowsAfter.length})`);
  }
  ok('replay is a no-op (1 ledger row, stateChanged=false)');

  console.log('\n→ Phase 4 audit — payment.failed flow: all assertions passed.');
}

main()
  .catch((err) => {
    console.error('verify-payment-failure crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
