import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  bookingWorkflowHref,
  checkoutRefundHref,
  paymentProofWorkflowHref,
  settlementWorkflowHref,
} from '../../src/lib/residents/commandCenterLinks';

test('paymentProofWorkflowHref encodes review key', () => {
  assert.equal(
    paymentProofWorkflowHref({
      key: 'rent:abc',
    } as Parameters<typeof paymentProofWorkflowHref>[0]),
    '/admin/operations?filter=waiting_for_approval&focus=rent%3Aabc',
  );
});

test('booking and settlement workflow hrefs', () => {
  assert.equal(bookingWorkflowHref('b1'), '/admin/bookings/b1');
  assert.equal(settlementWorkflowHref('s1'), '/admin/checkout-settlements/s1');
  assert.equal(checkoutRefundHref('b1'), '/admin/refunds?booking=b1');
});
