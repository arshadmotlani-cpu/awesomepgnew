import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBookingFinancialPhase,
  showBookingCheckoutFinancialOps,
  showBookingCheckoutOpsPanel,
} from '@/src/lib/admin/bookingFinancialPhase';

describe('bookingFinancialPhase', () => {
  it('treats pending_payment as checkout', () => {
    assert.equal(
      getBookingFinancialPhase({
        status: 'pending_payment',
        reservations: [],
        adminDepositRefundStatus: 'unknown',
        adminDuesStatus: 'unknown',
      }),
      'checkout',
    );
    assert.equal(showBookingCheckoutFinancialOps('checkout'), true);
  });

  it('treats active primary reservation as active after check-in', () => {
    const phase = getBookingFinancialPhase({
      status: 'confirmed',
      reservations: [{ kind: 'primary', status: 'active' }],
      adminDepositRefundStatus: 'unknown',
      adminDuesStatus: 'unknown',
    });
    assert.equal(phase, 'active');
    assert.equal(showBookingCheckoutFinancialOps(phase), false);
    assert.equal(showBookingCheckoutOpsPanel(phase), false);
  });

  it('shows checkout settlement ops when refund status is set', () => {
    const phase = getBookingFinancialPhase({
      status: 'confirmed',
      reservations: [{ kind: 'primary', status: 'active' }],
      adminDepositRefundStatus: 'pending',
      adminDuesStatus: 'unknown',
    });
    assert.equal(phase, 'checkout_settlement');
    assert.equal(showBookingCheckoutOpsPanel(phase), true);
  });
});
