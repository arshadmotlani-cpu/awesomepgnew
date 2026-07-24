import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  computeVacatingFinalPeriodRentDecision,
  resolveAnniversaryPeriodContainingDate,
} from '@/src/lib/billing/vacatingFinalPeriodRent';
import { dailyRateFromMonthly } from '@/src/services/billing';

describe('vacatingFinalPeriodRent — Jul 5 check-in, vacate Aug 7', () => {
  const moveIn = '2026-07-05';
  const billingDay = 5;
  const monthlyRentPaise = 30_000; // ₹300/mo → 1000 paise/day
  const paidJuly = {
    periodStart: '2026-07-05',
    periodEnd: '2026-08-04',
    source: 'rent_invoice' as const,
  };

  test('approved vacate inside unpaid period → suppress + 3 tail days', () => {
    const decision = computeVacatingFinalPeriodRentDecision({
      vacatingApproved: true,
      vacatingDate: '2026-08-07',
      billingDay,
      moveInDate: moveIn,
      monthlyRentPaise,
      paidPeriods: [paidJuly],
    });

    assert.equal(decision.shouldSuppressFinalInvoice, true);
    assert.equal(decision.tailDays, 3);
    assert.equal(decision.tailPeriodStart, '2026-08-05');
    assert.equal(decision.tailPeriodEnd, '2026-08-07');
    assert.equal(decision.tailRentPaise, 3 * dailyRateFromMonthly(monthlyRentPaise));
    assert.ok(decision.invoiceBillingMonth);
    assert.match(decision.cancellationReason ?? '', /final period in settlement/);
  });

  test('pending vacating does not suppress', () => {
    const decision = computeVacatingFinalPeriodRentDecision({
      vacatingApproved: false,
      vacatingDate: '2026-08-07',
      billingDay,
      moveInDate: moveIn,
      monthlyRentPaise,
      paidPeriods: [paidJuly],
    });
    assert.equal(decision.shouldSuppressFinalInvoice, false);
    assert.equal(decision.tailDays, 0);
  });

  test('vacate on period end → no suppression', () => {
    const period = resolveAnniversaryPeriodContainingDate({
      date: '2026-09-05',
      billingDay,
      moveInDate: moveIn,
    });
    assert.ok(period);
    assert.equal(period.periodEnd, '2026-09-05');

    const decision = computeVacatingFinalPeriodRentDecision({
      vacatingApproved: true,
      vacatingDate: '2026-09-05',
      billingDay,
      moveInDate: moveIn,
      monthlyRentPaise,
      paidPeriods: [
        paidJuly,
        { periodStart: '2026-08-05', periodEnd: '2026-09-04', source: 'rent_invoice' },
      ],
    });
    assert.equal(decision.shouldSuppressFinalInvoice, false);
  });

  test('paid final period → no suppression', () => {
    const decision = computeVacatingFinalPeriodRentDecision({
      vacatingApproved: true,
      vacatingDate: '2026-08-07',
      billingDay,
      moveInDate: moveIn,
      monthlyRentPaise,
      paidPeriods: [
        paidJuly,
        { periodStart: '2026-08-05', periodEnd: '2026-09-05', source: 'rent_invoice' },
      ],
    });
    assert.equal(decision.shouldSuppressFinalInvoice, false);
  });
});

describe('resolveAnniversaryPeriodContainingDate', () => {
  test('finds period containing vacating date', () => {
    const period = resolveAnniversaryPeriodContainingDate({
      date: '2026-08-07',
      billingDay: 5,
      moveInDate: '2026-07-05',
    });
    assert.ok(period);
    assert.equal(period.periodStart, '2026-08-05');
    assert.equal(period.periodEnd, '2026-09-05');
  });
});
