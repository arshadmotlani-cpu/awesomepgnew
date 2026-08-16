import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildResidentRentBillPresentation,
  inclusivePeriodEndForResidentDisplay,
  resolveRentInvoiceBillingPeriod,
} from '../../src/lib/residents/residentBillingPeriodDisplay';

describe('residentBillingPeriodDisplay', () => {
  test('calendar month from billingMonth when notes absent', () => {
    const period = resolveRentInvoiceBillingPeriod({
      billingMonth: '2026-09-01',
      notes: null,
    });
    assert.equal(period.periodStart, '2026-09-01');
    assert.equal(period.periodEndInclusive, '2026-09-30');
    const pres = buildResidentRentBillPresentation({
      billingMonth: '2026-09-01',
      notes: null,
    });
    assert.equal(pres.titleLabel, 'Rent · September 2026');
    assert.match(pres.periodLabel, /1 September 2026/);
    assert.match(pres.periodLabel, /30 September 2026/);
    assert.equal(pres.billingPeriodLine, `Billing period: ${pres.periodLabel}`);
  });

  test('half-open ISO period end becomes inclusive display', () => {
    const end = inclusivePeriodEndForResidentDisplay('2026-09-01', '2026-10-01');
    assert.match(end, /30 September 2026/);
    const pres = buildResidentRentBillPresentation({
      billingMonth: '2026-09-01',
      notes: 'Billing period: 2026-09-01 → 2026-10-01',
    });
    assert.match(pres.periodLabel, /30 September 2026/);
    assert.doesNotMatch(pres.periodLabel, /1 October/);
  });

  test('transition invoice uses explicit period from notes', () => {
    const pres = buildResidentRentBillPresentation({
      billingMonth: '2026-08-01',
      invoiceSubtype: 'billing_cycle_transition',
      notes: 'Billing cycle transition rent — prorated Billing period: 13 Aug 2026 → 31 Aug 2026',
    });
    assert.equal(pres.titleLabel, 'Billing transition');
    assert.match(pres.periodLabel, /13 August 2026/);
    assert.match(pres.periodLabel, /31 August 2026/);
    assert.ok(pres.transitionExplanation?.includes('1st of every month'));
  });

  test('anniversary notes keep inclusive end when already last day of span', () => {
    const pres = buildResidentRentBillPresentation({
      billingMonth: '2026-08-01',
      notes: 'Billing period: 9 Sep 2026 → 30 Sep 2026',
    });
    assert.match(pres.periodLabel, /9 September 2026/);
    assert.match(pres.periodLabel, /30 September 2026/);
  });

  test('anniversary same-day boundary converts to inclusive end', () => {
    const end = inclusivePeriodEndForResidentDisplay('2026-05-04', '2026-06-04');
    assert.match(end, /3 June 2026/);
    const pres = buildResidentRentBillPresentation({
      billingMonth: '2026-06-01',
      notes: 'Billing period: 4 May 2026 → 4 Jun 2026',
    });
    assert.match(pres.periodLabel, /4 May 2026/);
    assert.match(pres.periodLabel, /3 June 2026/);
  });
});
