import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_DEPOSIT_REFUND_BLOCKED_MESSAGE } from '../../src/lib/deposits/depositRefundMessages';

describe('depositRefundGuard messages', () => {
  it('blocked message points operators to checkout settlement', () => {
    assert.match(LEGACY_DEPOSIT_REFUND_BLOCKED_MESSAGE, /Checkout Settlement/);
    assert.match(LEGACY_DEPOSIT_REFUND_BLOCKED_MESSAGE, /checkout-settlements/);
  });
});
