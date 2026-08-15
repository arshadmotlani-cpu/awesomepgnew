import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  calendarDaysInclusive,
  computePrepaidRentAfterVacating,
  dailyRateFromBillingPeriod,
  rawPeriodFromInvoiceDueDate,
} from '@/src/lib/billing/billingCoverageModel';

test('dailyRateFromBillingPeriod uses actual calendar days in billing period', () => {
  assert.equal(calendarDaysInclusive('2026-02-01', '2026-02-28'), 28);
  assert.equal(calendarDaysInclusive('2028-02-01', '2028-02-29'), 29);
  assert.equal(calendarDaysInclusive('2026-07-01', '2026-07-31'), 31);

  const rentPaise = 300_000;
  const feb28Daily = dailyRateFromBillingPeriod(rentPaise, '2026-02-01', '2026-02-28');
  const feb29Daily = dailyRateFromBillingPeriod(rentPaise, '2028-02-01', '2028-02-29');
  const jul31Daily = dailyRateFromBillingPeriod(rentPaise, '2026-07-01', '2026-07-31');
  assert.equal(feb28Daily, Math.floor(rentPaise / 28));
  assert.equal(feb29Daily, Math.floor(rentPaise / 29));
  assert.equal(jul31Daily, Math.floor(rentPaise / 31));
  assert.notEqual(feb28Daily, jul31Daily);
});

test('computePrepaidRentAfterVacating uses invoice principal not monthly/30', () => {
  const period = {
    periodStart: '2026-07-21',
    periodEnd: '2026-08-20',
    paidPrincipalPaise: 412_080,
    source: 'rent_invoice' as const,
    sourceId: 'inv-1',
  };
  const prepaid = computePrepaidRentAfterVacating({
    vacatingDate: '2026-08-15',
    paidUntilDate: '2026-08-20',
    period,
    fallbackMonthlyRentPaise: 412_080,
  });
  const periodDaily = dailyRateFromBillingPeriod(
    412_080,
    period.periodStart,
    period.periodEnd,
  );
  assert.equal(prepaid.days, 5);
  assert.equal(prepaid.dailyRentPaise, periodDaily);
  assert.equal(prepaid.paise, periodDaily * 5);
  assert.notEqual(prepaid.dailyRentPaise, Math.floor(412_080 / 30));
});

test('billing coverage prepaid increases when vacating earlier within paid period', () => {
  const raw = rawPeriodFromInvoiceDueDate('2026-07-21', 21, 'inv-1');
  const paidPeriod = { ...raw, paidPrincipalPaise: 412_080 };
  const base = {
    bookingId: 'bk',
    moveInDate: '2026-07-21',
    billingDay: 21,
    rawPaidPeriods: [paidPeriod],
    noticeGivenDate: '2026-07-23',
    monthlyRentPaise: 412_080,
    rentReceivedPaise: 412_080,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  };
  const later = buildBillingCoverageModel({ ...base, vacatingDate: '2026-08-20' });
  const earlier = buildBillingCoverageModel({ ...base, vacatingDate: '2026-08-15' });
  assert.ok(earlier.prepaidAfterVacatingDays > later.prepaidAfterVacatingDays);
  assert.ok(earlier.prepaidAfterVacatingPaise > later.prepaidAfterVacatingPaise);
});
