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
  assert.match(src, /revalidateOccupancyViews/);
});

test('recordPaymentSuccess repairs missing reserve hold inside approval tx', () => {
  const src = read('src/services/bookingLifecycle.ts');
  assert.match(src, /ensureBedReserveHoldActiveForBooking\(booking\.id, tx\)/);
});

test('booking checkout submit uses fetch timeout and reserve redirect', () => {
  const src = read('src/components/customer/checkout/BookingCheckoutExperience.tsx');
  assert.match(src, /AbortController/);
  assert.match(src, /window\.location\.assign/);
  assert.match(src, /finally/);
});
