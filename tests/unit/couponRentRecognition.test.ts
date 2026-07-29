import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRentDuePaise,
  resolveRentInvoicePaymentApplication,
} from '../../src/services/rentInvoices';
import { allocateBookingCheckoutPayment } from '../../src/lib/billing/bookingPaymentAllocation';
import { splitBookingPayment } from '../../src/services/depositCollection';
import { computeNewBookingCheckoutTotals } from '../../src/lib/billing/bookingCheckoutTotals';
import { paiseToInr } from '../../src/lib/format';

describe('coupon rent recognition (dashboard Rent ≠ 0)', () => {
  const rentGross = 360_600; // ₹3,606
  const discount = 36_060; // ₹361
  const deposit = 360_600;
  const netRent = rentGross - discount; // ₹3,245

  it('normal rent (no coupon): fully paid when principal equals gross', () => {
    const applied = resolveRentInvoicePaymentApplication({
      principalPaise: rentGross,
      rentPaise: rentGross,
      discountPaise: 0,
    });
    assert.equal(applied.rentDuePaise, rentGross);
    assert.equal(applied.principal, rentGross);
    assert.equal(applied.fullyPaid, true);
  });

  it('discounted rent: net principal marks invoice fully paid (dashboard-eligible)', () => {
    // Bug was: fullyPaid = principal >= gross → false for net payment
    const buggyFullyPaid = netRent >= rentGross;
    assert.equal(buggyFullyPaid, false);

    const applied = resolveRentInvoicePaymentApplication({
      principalPaise: netRent,
      rentPaise: rentGross,
      discountPaise: discount,
    });
    assert.equal(applied.rentDuePaise, netRent);
    assert.equal(applied.principal, netRent);
    assert.equal(applied.fullyPaid, true);
    assert.equal(paiseToInr(applied.principal), '₹3,245');
  });

  it('rent + deposit checkout: allocation pays net rent then full deposit', () => {
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rentGross,
      depositRequiredPaise: deposit,
      discountPaise: discount,
    });
    assert.equal(totals.rentDuePaise, netRent);
    assert.equal(totals.depositDueNowPaise, deposit);
    assert.equal(totals.totalToCollectTodayPaise, netRent + deposit);

    const booking = {
      subtotalPaise: rentGross,
      discountPaise: discount,
      depositPaise: deposit,
      totalPaise: netRent + deposit,
      pricingSnapshot: null,
    };
    const paymentPaise = totals.totalToCollectTodayPaise;
    const alloc = allocateBookingCheckoutPayment(booking, paymentPaise);
    assert.equal(alloc.rentPaise, netRent);
    assert.equal(alloc.depositCashPaise, deposit);

    const split = splitBookingPayment(booking, paymentPaise);
    assert.equal(split.rentPaisePaid, netRent);
    assert.equal(split.depositPaisePaid, deposit);

    const recognition = resolveRentInvoicePaymentApplication({
      principalPaise: alloc.rentPaise,
      rentPaise: rentGross,
      discountPaise: discount,
    });
    assert.equal(recognition.fullyPaid, true);
  });

  it('deposit only (100% rent coupon): no rent due, all cash to deposit', () => {
    const fullDiscount = rentGross;
    const totals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: rentGross,
      depositRequiredPaise: deposit,
      discountPaise: fullDiscount,
    });
    assert.equal(totals.rentDuePaise, 0);
    assert.equal(totals.depositDueNowPaise, deposit);

    const booking = {
      subtotalPaise: rentGross,
      discountPaise: fullDiscount,
      depositPaise: deposit,
      totalPaise: deposit,
      pricingSnapshot: null,
    };
    const split = splitBookingPayment(booking, deposit);
    assert.equal(split.rentPaisePaid, 0);
    assert.equal(split.depositPaisePaid, deposit);

    // rentPaisePaid <= 0 → applyBookingRentInvoiceOnPaymentSuccess skips invoice
    assert.ok(split.rentPaisePaid <= 0);
  });

  it('partial principal below net due is not fully paid', () => {
    const applied = resolveRentInvoicePaymentApplication({
      principalPaise: netRent - 100,
      rentPaise: rentGross,
      discountPaise: discount,
    });
    assert.equal(applied.fullyPaid, false);
    assert.equal(applied.principal, netRent - 100);
  });

  it('mixed allocation uses line dues — not inferred from total', () => {
    const booking = {
      subtotalPaise: rentGross,
      discountPaise: discount,
      depositPaise: deposit,
      totalPaise: netRent + deposit + 50_000,
      pricingSnapshot: {
        priorOutstanding: {
          totalPaise: 50_000,
          items: [{ label: 'Prior rent', amountPaise: 50_000, kind: 'rent' as const }],
        },
      },
    };
    // Pay only net rent — must not steal from deposit or invent categories
    const onlyRent = allocateBookingCheckoutPayment(booking, netRent);
    assert.equal(onlyRent.rentPaise, netRent);
    assert.equal(onlyRent.depositCashPaise, 0);
    assert.equal(onlyRent.priorOutstandingPaise, 0);

    // Pay net rent + deposit — prior still unpaid
    const rentAndDeposit = allocateBookingCheckoutPayment(booking, netRent + deposit);
    assert.equal(rentAndDeposit.rentPaise, netRent);
    assert.equal(rentAndDeposit.depositCashPaise, deposit);
    assert.equal(rentAndDeposit.priorOutstandingPaise, 0);

    // Pay full including prior
    const full = allocateBookingCheckoutPayment(booking, netRent + deposit + 50_000);
    assert.equal(full.rentPaise, netRent);
    assert.equal(full.depositCashPaise, deposit);
    assert.equal(full.priorOutstandingPaise, 50_000);
  });

  it('computeRentDuePaise clamps discount to rent floor of zero', () => {
    assert.equal(computeRentDuePaise(100_000, 150_000), 0);
    assert.equal(computeRentDuePaise(100_000, null), 100_000);
  });

  it('electricity-only is out of booking checkout allocation (zero rent/deposit dues)', () => {
    // Booking checkout allocator is rent→deposit→prior only; electricity is separate invoices.
    const booking = {
      subtotalPaise: 0,
      discountPaise: 0,
      depositPaise: 0,
      totalPaise: 0,
      pricingSnapshot: null,
    };
    const alloc = allocateBookingCheckoutPayment(booking, 50_000);
    assert.equal(alloc.rentPaise, 0);
    assert.equal(alloc.depositCashPaise, 0);
    // leftover is not inventively classified as electricity by this allocator
    assert.equal(
      alloc.rentPaise + alloc.depositCashPaise + alloc.priorOutstandingPaise,
      0,
    );
  });
});
