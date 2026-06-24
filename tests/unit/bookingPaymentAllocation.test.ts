import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import { buildBookingPaymentAllocationLines } from '@/src/services/bookingPaymentFinancialProjection';

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
      sourceBookingCode: 'APG-2026-0032',
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

test('APG-2026-0036 allocation lines match invoice booking payment summary labels', () => {
  const allocation = allocateBookingCheckoutPayment(APG_0036_BOOKING, 268_500);
  const lines = buildBookingPaymentAllocationLines(APG_0036_BOOKING, allocation);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].label, 'Rent');
  assert.equal(lines[0].amountPaise, 190_000);
  assert.equal(lines[1].label, 'Deposit transfer from APG-2026-0032');
  assert.equal(lines[1].amountPaise, 33_000);
  assert.equal(lines[2].label, 'Deposit collected');
  assert.equal(lines[2].amountPaise, 62_000);
  assert.equal(lines[3].label, 'Previous deposit due cleared');
  assert.equal(lines[3].amountPaise, 16_500);
});
