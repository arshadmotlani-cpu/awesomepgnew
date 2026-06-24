import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBookingRentPaisePaid } from '../../src/services/bookingPaymentInvoices';

const APG_0036_PRICING_SNAPSHOT = {
  depositCredit: {
    appliedPaise: 33_000,
    adminTransferred: true,
    sourceBookingId: 'prior-booking',
  },
  priorOutstanding: {
    totalPaise: 16_500,
    items: [
      {
        label: 'Prior deposit due',
        amountPaise: 16_500,
        bookingId: 'prior-booking',
        bookingCode: 'APG-2026-0032',
        kind: 'deposit' as const,
      },
    ],
  },
};

describe('computeBookingRentPaisePaid', () => {
  const booking = {
    id: 'b1',
    customerId: 'c1',
    bookingCode: 'APG-TEST',
    durationMode: 'fixed_stay' as const,
    subtotalPaise: 190_000,
    discountPaise: 0,
    depositPaise: 95_000,
    totalPaise: 268_500,
    pricingSnapshot: APG_0036_PRICING_SNAPSHOT,
  };

  it('splits booking payment into rent and deposit portions', () => {
    assert.equal(
      computeBookingRentPaisePaid({
        booking,
        paymentAmountPaise: 268_500,
      }),
      190_000,
    );
  });

  it('excludes PS4 membership from rent/deposit split', () => {
    assert.equal(
      computeBookingRentPaisePaid({
        booking,
        paymentAmountPaise: 288_500,
        membershipAmountPaise: 20_000,
      }),
      190_000,
    );
  });
});
