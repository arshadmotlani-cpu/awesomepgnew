import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBookingRentPaisePaid } from '../../src/services/bookingPaymentInvoices';

describe('computeBookingRentPaisePaid', () => {
  const booking = {
    id: 'b1',
    customerId: 'c1',
    bookingCode: 'APG-TEST',
    durationMode: 'fixed_stay' as const,
    subtotalPaise: 173_500,
    discountPaise: 0,
    depositPaise: 95_000,
    totalPaise: 268_500,
    pricingSnapshot: null,
  };

  it('splits booking payment into rent and deposit portions', () => {
    assert.equal(
      computeBookingRentPaisePaid({
        booking,
        paymentAmountPaise: 268_500,
      }),
      173_500,
    );
  });

  it('excludes PS4 membership from rent/deposit split', () => {
    assert.equal(
      computeBookingRentPaisePaid({
        booking,
        paymentAmountPaise: 288_500,
        membershipAmountPaise: 20_000,
      }),
      173_500,
    );
  });
});
