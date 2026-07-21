import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

test('lifecycle revalidation runs once per mutation in service SSOT', () => {
  const qr = read('src/services/qrPayments.ts');
  const reject = read('src/services/paymentProofRejectionService.ts');
  const bedReserve = read('src/services/bedReserve.ts');

  assert.match(qr, /revalidateReservationLifecycleViews\(\{ pgId, bookingCode: input\.bookingCode \}\)/);
  assert.match(qr, /await revalidateAfterBookingPaymentReview\(/);
  const finalizeFn = qr.slice(
    qr.indexOf('async function finalizeApprovedReserveBooking'),
    qr.indexOf('async function revalidateAfterBookingPaymentReview'),
  );
  assert.doesNotMatch(finalizeFn, /revalidateReservationLifecycleViews/);

  assert.match(reject, /await revalidateAfterPaymentProofMutation\(ctx\.pgId, ctx\.bookingId\)/);

  assert.match(bedReserve, /await revalidateReservationLifecycleForBookingId/);
  assert.match(bedReserve, /await revalidateReservationLifecycleForBookingIds/);
});

test('route and action layers do not duplicate lifecycle revalidation', () => {
  const apiRoute = read('app/api/payment-record/booking/route.ts');
  const reserveActions = read('app/(customer)/reserve/new/actions.ts');
  const bookingActions = read('app/(customer)/booking/[bookingCode]/actions.ts');
  const adminPayments = read('app/(admin)/admin/payments/actions.ts');

  assert.doesNotMatch(apiRoute, /revalidateReservationLifecycle/);
  assert.doesNotMatch(reserveActions, /revalidateReservationLifecycle/);
  assert.doesNotMatch(bookingActions, /revalidateReservationLifecycle/);
  assert.doesNotMatch(adminPayments, /revalidateReservationLifecycleViews/);
});

test('expire cron routes revalidate lifecycle after mutations', () => {
  const expireReservesCron = read('app/api/cron/expire-bed-reserves/route.ts');
  const releaseHoldsCron = read('app/api/cron/release-holds/route.ts');
  assert.match(expireReservesCron, /revalidateReservationLifecycleViews/);
  assert.match(releaseHoldsCron, /revalidateReservationLifecycleViews/);
});

test('revalidate helper dedupes base and target paths', () => {
  const src = read('src/lib/occupancyRevalidate.ts');
  assert.match(src, /revalidateReservationLifecycleBase/);
  assert.match(src, /revalidateReservationLifecycleTargets/);
  assert.match(src, /scheduleAvailabilityCacheInvalidation/);
  assert.match(src, /for \(const bookingCode of bookingCodes\)/);
  assert.doesNotMatch(src, /revalidateReservationLifecycleViews\(\);[\s\S]*revalidateReservationLifecycleViews\(\);/);
});

test('post-submit side effects remain fire-and-forget without cache busting', () => {
  const qr = read('src/services/qrPayments.ts');
  assert.match(qr, /void runPostBookingPaymentSubmitSideEffects/);
  const sideEffects = qr.slice(qr.indexOf('function runPostBookingPaymentSubmitSideEffects'));
  assert.doesNotMatch(sideEffects.slice(0, 800), /revalidateReservationLifecycle/);
});
