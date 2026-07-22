import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVAL_REGISTRY,
  BILLING_INVOICE_REVIEW_HREF,
  registryByActionItemType,
} from '../../src/lib/approvals/approvalRegistry';
import {
  buildApprovalDeepLink,
  finalizeApprovalNotificationDeepLink,
  paymentApprovalDeepLink,
} from '../../src/lib/approvals/approvalDeepLinks';

test('approval registry covers payment proof action items', () => {
  const payment = registryByActionItemType('payment_received');
  assert.ok(payment);
  assert.equal(payment?.operationsFilter, 'waiting_for_approval');
  assert.equal(payment?.inPaymentProofQueue, true);
});

test('approval registry includes booking_approval', () => {
  const booking = registryByActionItemType('booking_approval');
  assert.ok(booking);
  assert.equal(booking?.operationsFilter, 'booking_approval');
});

test('billing invoice review is separate from payment proof queue', () => {
  assert.ok(BILLING_INVOICE_REVIEW_HREF.includes('/admin/billing'));
  assert.ok(!BILLING_INVOICE_REVIEW_HREF.includes('waiting_for_approval'));
});

test('paymentApprovalDeepLink uses Payment Review Workspace', () => {
  const href = paymentApprovalDeepLink('rent:abc-123');
  assert.equal(href, '/admin/payment-review/rent%3Aabc-123');
});

test('finalizeApprovalNotificationDeepLink never keeps billing href for proofs', () => {
  const href = finalizeApprovalNotificationDeepLink(
    'payment_received',
    '/admin/billing?tab=approvals',
    { paymentReviewKey: 'elec:xyz' },
  );
  assert.ok(href.includes('/admin/payment-review/'));
  assert.ok(!href.includes('/admin/billing'));
});

test('booking_approval deep link routes to booking page', () => {
  const href = buildApprovalDeepLink(
    'booking_approval',
    { bookingId: 'bk-1', bookingCode: 'AP-001' },
    null,
  );
  assert.equal(href, '/admin/bookings/bk-1');
  assert.equal(href.startsWith('/booking/'), false);
});

test('registry has unique kinds', () => {
  const kinds = APPROVAL_REGISTRY.map((e) => e.kind);
  assert.equal(new Set(kinds).size, kinds.length);
});
