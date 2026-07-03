import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRefundConsoleActionable,
  partitionRefundConsoleBookings,
} from '@/src/lib/refund/refundConsoleActionability';

const base = {
  remainingDepositPaise: 0,
  adminDepositRefundStatus: null,
  checkoutStatus: null,
  checkoutFinalRefundPaise: null,
};

test('refundable balance > 0 is actionable', () => {
  assert.equal(isRefundConsoleActionable({ ...base, remainingDepositPaise: 50000 }), true);
});

test('completed ₹0 booking with no checkout work is historical', () => {
  assert.equal(
    isRefundConsoleActionable({
      ...base,
      adminDepositRefundStatus: 'refunded',
      checkoutStatus: 'completed',
    }),
    false,
  );
});

test('admin deposit refund pending is actionable even at ₹0 balance', () => {
  assert.equal(
    isRefundConsoleActionable({ ...base, adminDepositRefundStatus: 'pending' }),
    true,
  );
});

test('active checkout settlement is actionable at ₹0 balance', () => {
  assert.equal(
    isRefundConsoleActionable({ ...base, checkoutStatus: 'awaiting_admin_review' }),
    true,
  );
  assert.equal(
    isRefundConsoleActionable({
      ...base,
      checkoutStatus: 'refund_pending',
      checkoutFinalRefundPaise: 25000,
    }),
    true,
  );
});

test('stale zero refund_pending checkout is not actionable', () => {
  assert.equal(
    isRefundConsoleActionable({
      ...base,
      checkoutStatus: 'refund_pending',
      checkoutFinalRefundPaise: 0,
    }),
    false,
  );
});

test('partitionRefundConsoleBookings splits actionable and historical', () => {
  const partitioned = partitionRefundConsoleBookings([
    { bookingId: 'a', isActionable: true },
    { bookingId: 'b', isActionable: false },
    { bookingId: 'c', isActionable: true },
  ]);
  assert.deepEqual(
    partitioned.actionable.map((r) => r.bookingId),
    ['a', 'c'],
  );
  assert.deepEqual(partitioned.historical.map((r) => r.bookingId), ['b']);
});
