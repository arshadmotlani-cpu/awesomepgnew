import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isResidentActiveOnDate } from '../../src/services/billing';
import {
  shouldSuppressAnniversaryInvoiceForVacating,
  computeVacatingFinalPeriodRentDecision,
} from '../../src/lib/billing/vacatingFinalPeriodRent';
import { shouldPreviewUpcomingRentGeneration } from '../../src/services/billingUpcomingSchedule';

describe('shouldPreviewUpcomingRentGeneration', () => {
  it('excludes residents with an existing invoice for the cycle', () => {
    assert.equal(
      shouldPreviewUpcomingRentGeneration({
        hasExistingInvoice: true,
        eligibility: {
          eligible: true,
          customerId: 'c1',
          bedId: 'b1',
          pgId: 'pg1',
          rentPaise: 100_000,
          dueDate: '2026-08-05',
          billingMonth: '2026-08-01',
          invoiceNotes: 'note',
          billingPeriod: { periodStart: '2026-07-05', periodEnd: '2026-08-04' },
        },
      }),
      false,
    );
  });

  it('includes only eligible residents without an existing invoice', () => {
    assert.equal(
      shouldPreviewUpcomingRentGeneration({
        hasExistingInvoice: false,
        eligibility: { eligible: false, skipCode: 'vacating_final_period' },
      }),
      false,
    );
    assert.equal(
      shouldPreviewUpcomingRentGeneration({
        hasExistingInvoice: false,
        eligibility: {
          eligible: true,
          customerId: 'c1',
          bedId: 'b1',
          pgId: 'pg1',
          rentPaise: 100_000,
          dueDate: '2026-08-05',
          billingMonth: '2026-08-01',
          invoiceNotes: 'note',
          billingPeriod: { periodStart: '2026-07-05', periodEnd: '2026-08-04' },
        },
      }),
      true,
    );
  });
});

describe('upcoming preview eligibility scenarios', () => {
  const billingDay = 5;
  const moveIn = '2026-07-05';
  const monthlyRentPaise = 30_000;
  const paidJuly = {
    periodStart: '2026-07-05',
    periodEnd: '2026-08-04',
    source: 'rent_invoice' as const,
  };

  it('approved vacating before next unpaid period suppresses anniversary invoice', () => {
    const decision = computeVacatingFinalPeriodRentDecision({
      vacatingApproved: true,
      vacatingDate: '2026-08-07',
      billingDay,
      moveInDate: moveIn,
      monthlyRentPaise,
      paidPeriods: [paidJuly],
    });

    assert.equal(decision.shouldSuppressFinalInvoice, true);
    assert.equal(decision.invoiceBillingMonth, '2026-09-01');
    assert.equal(
      shouldSuppressAnniversaryInvoiceForVacating({
        decision,
        billingMonth: '2026-09-01',
        billingDay,
        anniversaryDueDate: '2026-09-05',
      }),
      true,
    );
  });

  it('approved vacating after billing cycle start does not suppress anniversary invoice', () => {
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
    assert.equal(
      shouldSuppressAnniversaryInvoiceForVacating({
        decision,
        billingMonth: '2026-09-01',
        billingDay,
        anniversaryDueDate: '2026-09-05',
      }),
      false,
    );
  });

  it('checked-out resident is inactive on anniversary date', () => {
    assert.equal(
      isResidentActiveOnDate({ start: '2026-07-01', end: '2026-08-04' }, '2026-08-05'),
      false,
    );
  });

  it('normal active resident is active on anniversary date', () => {
    assert.equal(
      isResidentActiveOnDate({ start: '2026-07-01', end: null }, '2026-08-05'),
      true,
    );
  });
});
