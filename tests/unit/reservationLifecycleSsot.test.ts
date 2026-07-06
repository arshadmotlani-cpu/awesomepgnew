import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bedReserveHoldBlocksInventory,
  deriveBedReservePhase,
  deriveBookingReservationPhase,
  reservationBlocksInventory,
  reservationVisibleToAdmin,
  UNFINISHED_RESERVATION_HEADLINE,
} from '@/src/lib/reservationLifecycle/constants';

test('bedReserveHoldBlocksInventory — draft and under_review semantics', () => {
  assert.equal(bedReserveHoldBlocksInventory({ status: 'pending_payment' }), false);
  assert.equal(bedReserveHoldBlocksInventory({ status: 'under_review' }), true);
  assert.equal(
    bedReserveHoldBlocksInventory({ status: 'pending_payment', paymentProofUrl: 'proof.png' }),
    true,
  );
  assert.equal(bedReserveHoldBlocksInventory({ status: 'active' }), true);
});

test('deriveBedReservePhase maps hold rows to lifecycle phases', () => {
  assert.equal(deriveBedReservePhase({ status: 'pending_payment' }), 'draft');
  assert.equal(
    deriveBedReservePhase({ status: 'pending_payment', paymentProofUrl: 'x' }),
    'under_review',
  );
  assert.equal(deriveBedReservePhase({ status: 'under_review' }), 'under_review');
  assert.equal(deriveBedReservePhase({ status: 'active' }), 'approved');
});

test('deriveBookingReservationPhase — server draft is not admin-visible', () => {
  assert.equal(
    deriveBookingReservationPhase({ bookingStatus: 'draft' }),
    'draft',
  );
  assert.equal(reservationVisibleToAdmin('draft'), false);
  assert.equal(reservationVisibleToAdmin('under_review'), true);
  assert.equal(reservationBlocksInventory('draft'), false);
  assert.equal(reservationBlocksInventory('under_review'), true);
});

test('unfinished reservation copy is customer-friendly', () => {
  assert.match(UNFINISHED_RESERVATION_HEADLINE, /unfinished reservation/i);
});
