import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';

/** APG-2026-0036 accepted allocation (₹2,685 payment). */
const APG_0036_BOOKING = {
  subtotalPaise: 190_000,
  discountPaise: 0,
  depositPaise: 95_000,
  totalPaise: 268_500,
  pricingSnapshot: {
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
  },
};

test('APG-2026-0036 payment splits rent, deposit cash, and prior deposit due', () => {
  const allocation = allocateBookingCheckoutPayment(APG_0036_BOOKING, 268_500);
  assert.equal(allocation.rentPaise, 190_000);
  assert.equal(allocation.depositCashPaise, 62_000);
  assert.equal(allocation.priorOutstandingPaise, 16_500);
  assert.equal(allocation.depositTransferCreditPaise, 33_000);
  assert.equal(allocation.unallocatedPaise, 0);
});
