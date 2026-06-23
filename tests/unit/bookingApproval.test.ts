import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveBookingApprovalPhase,
  isApprovedBookingStatus,
  isPreApprovalBookingStatus,
} from '../../src/lib/bookingApproval';

test('deriveBookingApprovalPhase — payment not yet submitted', () => {
  assert.equal(
    deriveBookingApprovalPhase({ status: 'pending_payment', hasPendingPaymentProof: false }),
    'awaiting_payment',
  );
});

test('deriveBookingApprovalPhase — proof submitted', () => {
  assert.equal(
    deriveBookingApprovalPhase({ status: 'pending_approval', hasPendingPaymentProof: true }),
    'awaiting_admin_approval',
  );
  assert.equal(
    deriveBookingApprovalPhase({ status: 'pending_payment', hasPendingPaymentProof: true }),
    'awaiting_admin_approval',
  );
});

test('deriveBookingApprovalPhase — confirmed', () => {
  assert.equal(
    deriveBookingApprovalPhase({ status: 'confirmed', hasPendingPaymentProof: false }),
    'approved',
  );
});

test('pre-approval statuses exclude confirmed', () => {
  assert.equal(isPreApprovalBookingStatus('pending_payment'), true);
  assert.equal(isPreApprovalBookingStatus('pending_approval'), true);
  assert.equal(isApprovedBookingStatus('confirmed'), true);
  assert.equal(isApprovedBookingStatus('pending_approval'), false);
});
