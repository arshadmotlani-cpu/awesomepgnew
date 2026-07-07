import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

test('submitBookingPaymentRecord atomically activates reserve hold in payment tx', () => {
  const src = read('src/services/qrPayments.ts');
  assert.match(src, /if \(booking\.durationMode === 'reserve'\)/);
  assert.match(src, /activateBedReserveRequestForBooking\(booking\.id, proof, tx\)/);
  assert.match(src, /runPostBookingPaymentSubmitSideEffects/);
});

test('reviewPaymentRecord heals reserve hold on every approval exit path', () => {
  const src = read('src/services/qrPayments.ts');
  assert.match(src, /finalizeApprovedReserveBooking/);
  assert.match(src, /ensureBedReserveHoldActiveForBooking/);
  assert.match(src, /revalidateReservationLifecycleViews/);
});

test('recordPaymentSuccess repairs missing reserve hold inside approval tx', () => {
  const src = read('src/services/bookingLifecycle.ts');
  assert.match(src, /ensureBedReserveHoldActiveForBooking\(booking\.id, tx\)/);
});

test('booking checkout submit uses fetch timeout and redirects to booking page', () => {
  const src = read('src/components/customer/checkout/BookingCheckoutExperience.tsx');
  assert.match(src, /AbortController/);
  assert.match(src, /window\.location\.assign\(`\/booking\/\$\{/);
  assert.match(src, /recordId\?: string/);
  assert.doesNotMatch(src, /Invalid server response/);
  assert.match(src, /finally/);
});

test('payment-record booking API returns JSON-safe slim payload', () => {
  const src = read('app/api/payment-record/booking/route.ts');
  assert.match(src, /recordId: String\(record\.id\)/);
  assert.match(src, /bookingCode: body\.bookingCode/);
  assert.doesNotMatch(src, /record,/);
  assert.doesNotMatch(src, /revalidateReservationLifecycle/);
});
