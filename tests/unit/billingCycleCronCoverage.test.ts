import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  findFirstUncoveredCalendarMonth,
  isCalendarBillingMonthFullyCovered,
  parseBillingPeriodFromInvoiceNotes,
} from '@/src/lib/billing/billingCoverageModel';
import {
  firstAutoBillingRunDateAfterCoverage,
  prorateForMonth,
} from '@/src/services/billing';

describe('firstAutoBillingRunDateAfterCoverage', () => {
  test('paid through Jul 31 → first auto Aug 1 (Syed gap month)', () => {
    assert.equal(firstAutoBillingRunDateAfterCoverage('2026-07-31', '2026-07-28'), '2026-08-01');
  });

  test('paid through Sep 7 → first auto Oct 1 (Saswat-like)', () => {
    assert.equal(firstAutoBillingRunDateAfterCoverage('2026-09-07', '2026-08-08'), '2026-10-01');
  });

  test('paid through Sep 30 → first auto Oct 1', () => {
    assert.equal(firstAutoBillingRunDateAfterCoverage('2026-09-30', '2026-08-08'), '2026-10-01');
  });

  test('no paid through uses check-in first auto', () => {
    assert.equal(
      firstAutoBillingRunDateAfterCoverage(null, '2026-08-08'),
      firstAutoBillingRunDateAfterCoverage(null, '2026-08-08'),
    );
  });
});

describe('parseBillingPeriodFromInvoiceNotes', () => {
  test('parses display label from transition invoice notes', () => {
    const parsed = parseBillingPeriodFromInvoiceNotes(
      'Billing cycle transition rent — prorated Billing period: 29 Jul 2026 → 31 Jul 2026',
    );
    assert.ok(parsed);
    assert.equal(parsed!.periodStart, '2026-07-29');
    assert.equal(parsed!.periodEnd, '2026-07-31');
  });
});

describe('calendar month coverage', () => {
  test('paid until covers full September', () => {
    const covered = isCalendarBillingMonthFullyCovered({
      billingMonth: '2026-09-01',
      paidUntilDate: '2026-09-30',
      paidInvoiceCoverage: [],
    });
    assert.equal(covered, true);
  });

  test('transition period covers full month', () => {
    const covered = isCalendarBillingMonthFullyCovered({
      billingMonth: '2026-08-01',
      paidUntilDate: null,
      paidInvoiceCoverage: [
        {
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          source: 'rent_invoice',
          sourceId: 'x',
          paidPrincipalPaise: 1000,
        },
      ],
    });
    assert.equal(covered, true);
  });

  test('finds August uncovered between Jul 31 paid and Sep 1 first auto', () => {
    const month = findFirstUncoveredCalendarMonth({
      paidUntilDate: '2026-07-31',
      firstAutoBillingDate: '2026-09-01',
      paidInvoiceCoverage: [
        {
          periodStart: '2026-07-28',
          periodEnd: '2026-07-28',
          source: 'rent_invoice',
          sourceId: 'july',
          paidPrincipalPaise: 360_600,
        },
      ],
    });
    assert.equal(month, '2026-08-01');
  });

  test('finds August when first auto is Aug 1 and asOf past Aug 1 (Syed missed cron)', () => {
    const month = findFirstUncoveredCalendarMonth({
      paidUntilDate: '2026-07-28',
      firstAutoBillingDate: '2026-08-01',
      paidInvoiceCoverage: [],
      asOf: '2026-08-16',
    });
    assert.equal(month, '2026-08-01');
  });

  test('does not bill full August when paid through Aug 12 (Saswat-like)', () => {
    const month = findFirstUncoveredCalendarMonth({
      paidUntilDate: '2026-08-12',
      firstAutoBillingDate: '2026-09-01',
      paidInvoiceCoverage: [
        {
          periodStart: '2026-08-08',
          periodEnd: '2026-08-12',
          source: 'rent_invoice',
          sourceId: 'aug',
          paidPrincipalPaise: 412_100,
        },
      ],
      asOf: '2026-08-16',
    });
    assert.equal(month, null);
  });
});

describe('Syed Ahmed transition proration reference', () => {
  test('Jul 29–31 proration at ₹3,606/month (3 calendar days)', () => {
    const pr = prorateForMonth({
      monthlyRatePaise: 360_600,
      billingMonth: '2026-07-01',
      activeStart: '2026-07-29',
      activeEnd: '2026-08-01',
    });
    assert.equal(pr.daysActive, 3);
    assert.equal(pr.daysInMonth, 31);
    // floor(360600×3/31) = 34896 paise = ₹348.96 (not ₹233 from buggy 2-day count)
    assert.equal(pr.amountPaise, Math.floor((360_600 * 3) / 31));
  });

  test('Saswat Aug 13–31 proration at ₹4,121/month (19 calendar days)', () => {
    const pr = prorateForMonth({
      monthlyRatePaise: 412_100,
      billingMonth: '2026-08-01',
      activeStart: '2026-08-13',
      activeEnd: '2026-09-01',
    });
    assert.equal(pr.daysActive, 19);
    assert.equal(pr.daysInMonth, 31);
    // floor(412100×19/31) = 252576 paise = ₹2525.76 (not ₹2393 from 18-day bug)
    assert.equal(pr.amountPaise, Math.floor((412_100 * 19) / 31));
  });
});
