import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBookingCheckoutOverpaymentPaise,
  normalizeOverpaymentDisposition,
} from '../../src/services/bookingOverpayment';

const BOOKING = {
  subtotalPaise: 100_000,
  discountPaise: 0,
  depositPaise: 50_000,
  totalPaise: 150_000,
  pricingSnapshot: null,
};

describe('booking overpayment', () => {
  it('normalizeOverpaymentDisposition maps refund_later to refund', () => {
    assert.equal(normalizeOverpaymentDisposition('refund_later'), 'refund');
    assert.equal(normalizeOverpaymentDisposition('refund'), 'refund');
    assert.equal(normalizeOverpaymentDisposition('wallet_credit'), 'wallet_credit');
    assert.equal(normalizeOverpaymentDisposition('future_adjustment'), 'future_adjustment');
    assert.equal(normalizeOverpaymentDisposition(undefined), null);
  });

  it('computeBookingCheckoutOverpaymentPaise is zero for exact checkout', () => {
    const excess = computeBookingCheckoutOverpaymentPaise({
      booking: BOOKING,
      amountPaise: 150_000,
    });
    assert.equal(excess, 0);
  });

  it('computeBookingCheckoutOverpaymentPaise returns excess when overpaid', () => {
    const excess = computeBookingCheckoutOverpaymentPaise({
      booking: BOOKING,
      amountPaise: 160_000,
    });
    assert.equal(excess, 10_000);
  });

  it('computeBookingCheckoutOverpaymentPaise subtracts prior outstanding applied', () => {
    const excess = computeBookingCheckoutOverpaymentPaise({
      booking: {
        ...BOOKING,
        totalPaise: 200_000,
        pricingSnapshot: {
          priorOutstanding: {
            totalPaise: 50_000,
            items: [{ label: 'Prior deposit', amountPaise: 50_000, kind: 'deposit' }],
          },
        },
      },
      amountPaise: 210_000,
      priorOutstandingAppliedPaise: 50_000,
    });
    assert.equal(excess, 10_000);
  });
});
