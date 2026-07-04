import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeCheckoutRentProration } from '../../src/lib/billing/checkoutRentProration';
import { allocateBookingCheckoutPayment } from '../../src/lib/billing/bookingPaymentAllocation';
import {
  buildBookingPaymentAllocationLines,
  sumAllocationLines,
} from '../../src/services/bookingPaymentFinancialProjection';

describe('computeCheckoutRentProration — anniversary billing', () => {
  test('mid-month join: full month rent, no advance credit', () => {
    const proration = computeCheckoutRentProration({
      subtotalPaise: 412_100,
      discountPaise: 0,
      durationMode: 'open_ended',
      stayStartDate: '2026-07-04',
      pricingSnapshot: {
        perBed: [{ monthlyRatePaise: 412_100 } as never],
      },
    });

    assert.equal(proration.quotedRentPaise, 412_100);
    assert.equal(proration.firstMonthInvoiceRentPaise, 412_100);
    assert.equal(proration.advanceRentCreditPaise, 0);
    assert.equal(proration.isProrated, false);
    assert.equal(proration.rentAllocationLabel, "First month's rent");
  });

  test('check-in on 1st: full month, no proration', () => {
    const proration = computeCheckoutRentProration({
      subtotalPaise: 412_100,
      discountPaise: 0,
      durationMode: 'open_ended',
      stayStartDate: '2026-07-01',
      pricingSnapshot: {
        perBed: [{ monthlyRatePaise: 412_100 } as never],
      },
    });

    assert.equal(proration.advanceRentCreditPaise, 0);
    assert.equal(proration.firstMonthInvoiceRentPaise, 412_100);
    assert.equal(proration.isProrated, false);
  });
});

describe('buildBookingPaymentAllocationLines — anniversary checkout', () => {
  test('₹8,242 payment allocates to first month rent + deposit only', () => {
    const booking = {
      subtotalPaise: 412_100,
      discountPaise: 0,
      depositPaise: 412_100,
      totalPaise: 824_200,
      durationMode: 'open_ended',
      pricingSnapshot: {
        perBed: [{ monthlyRatePaise: 412_100 } as never],
      },
    };
    const allocation = allocateBookingCheckoutPayment(booking, 824_200);
    const lines = buildBookingPaymentAllocationLines(booking, allocation, {
      stayStartDate: '2026-07-04',
    });

    assert.equal(sumAllocationLines(lines), 824_200);
    assert.equal(lines.find((l) => l.key === 'rent_invoice')?.amountPaise, 412_100);
    assert.equal(lines.find((l) => l.key === 'advance_rent_credit'), undefined);
    assert.equal(lines.find((l) => l.key === 'deposit_collected')?.amountPaise, 412_100);
    assert.match(lines.find((l) => l.key === 'rent_invoice')?.label ?? '', /First month's rent/);
  });
});
