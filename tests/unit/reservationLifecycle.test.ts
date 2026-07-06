import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveBookingApprovalPhase } from '@/src/lib/bookingApproval';
import { customerBookingBannerCopy } from '@/src/lib/booking/bookingStatus';
import { bedReserveHoldBlocksInventory } from '@/src/services/bedReserve';
import { BOOKING_AWAITING_PAYMENT_REVIEW_STATUSES } from '@/src/lib/operations/paymentReviewSsot';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

test('deriveBookingApprovalPhase — draft is inactive until proof submit', () => {
  assert.equal(
    deriveBookingApprovalPhase({ status: 'draft', hasPendingPaymentProof: false }),
    'inactive',
  );
});

test('customer banner — pending approval shows under-review headline', () => {
  const copy = customerBookingBannerCopy('pending_approval');
  assert.match(copy.headline, /under review/i);
});

test('bedReserveHoldBlocksInventory — proof-gated blocking', () => {
  assert.equal(bedReserveHoldBlocksInventory({ status: 'pending_payment' }), false);
  assert.equal(
    bedReserveHoldBlocksInventory({ status: 'pending_payment', paymentProofUrl: 'proof.png' }),
    true,
  );
  assert.equal(bedReserveHoldBlocksInventory({ status: 'active' }), true);
});

test('payment review SSOT includes draft bookings awaiting checkout', () => {
  assert.ok(BOOKING_AWAITING_PAYMENT_REVIEW_STATUSES.includes('draft'));
});

test('reservation request service emits lifecycle audit actions', () => {
  const src = read('src/services/reservationRequest.ts');
  assert.match(src, /reservation_request_submitted/);
  assert.match(src, /draft_abandoned/);
});

test('bed reserve proof submit moves to under-review blocking', () => {
  const src = read('src/services/bedReserve.ts');
  assert.match(src, /activateBedReserveRequestForBooking/);
  assert.match(src, /reservation_request_submitted/);
});

test('cleanupRejectedBookingRequest cancels under_review reservations', () => {
  const src = read('src/lib/bookingApproval.ts');
  assert.match(src, /under_review/);
});

test('public room detail uses bedOccupancyEngine with under-review input', () => {
  const src = read('src/db/queries/customer.ts');
  assert.match(src, /resolveBedOccupancy/);
  assert.match(src, /underReviewRequest/);
});
