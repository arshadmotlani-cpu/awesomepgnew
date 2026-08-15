import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  computeNoticeDeductionBreakdown,
  resolvePaidThroughDate,
  unusedPrepaidRentDaysAfterVacating,
} from '../../src/lib/vacating/noticeDeductionEngine';
import { noticeDeductionAppliesToBooking } from '../../src/lib/checkout/noticeDeductionPolicy';
import { VACATING_NOTICE_MIN_DAYS } from '../../src/services/billing';

test('compliant notice: chargeable = 0, deduction = 0', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-01',
    vacatingDate: '2026-06-20',
    paidRentPeriods: [],
  });
  assert.equal(breakdown.missingNoticeDays, 0);
  assert.equal(breakdown.chargeableNoticeDays, 0);
  assert.equal(breakdown.noticeDeductionPaise, 0);
});

test('5 missing notice, 19 unused prepaid days → fully covered', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-05-01',
    vacatingDate: '2026-05-01',
    paidRentPeriods: [
      {
        periodStart: '2026-04-05',
        periodEnd: '2026-05-24',
        source: 'rent_invoice',
        paidPrincipalPaise: 300_000,
      },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, VACATING_NOTICE_MIN_DAYS);
  assert.equal(breakdown.unusedPrepaidRentDays, 23);
  assert.equal(breakdown.noticeCoveredByPrepaidRent, VACATING_NOTICE_MIN_DAYS);
  assert.equal(breakdown.chargeableNoticeDays, 0);
  assert.equal(breakdown.noticeDeductionPaise, 0);
});

test('5 missing notice, 3 unused prepaid days → chargeable = 2', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-05-01',
    vacatingDate: '2026-05-01',
    paidRentPeriods: [
      {
        periodStart: '2026-04-05',
        periodEnd: '2026-05-04',
        source: 'rent_invoice',
        paidPrincipalPaise: 300_000,
      },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, VACATING_NOTICE_MIN_DAYS);
  assert.equal(breakdown.unusedPrepaidRentDays, 3);
  assert.equal(breakdown.noticeCoveredByPrepaidRent, 3);
  assert.equal(breakdown.chargeableNoticeDays, 2);
  assert.equal(breakdown.noticeDeductionPaise, 20_000);
});

test('5 missing notice, 15 unused prepaid → chargeable = 0', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-10',
    vacatingDate: '2026-06-10',
    paidRentPeriods: [
      {
        periodStart: '2026-06-05',
        periodEnd: '2026-06-30',
        source: 'rent_invoice',
        paidPrincipalPaise: 300_000,
      },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, VACATING_NOTICE_MIN_DAYS);
  assert.equal(breakdown.unusedPrepaidRentDays, 20);
  assert.equal(breakdown.noticeCoveredByPrepaidRent, VACATING_NOTICE_MIN_DAYS);
  assert.equal(breakdown.chargeableNoticeDays, 0);
});

test('no prepaid after vacate: chargeable = missing notice days', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-01',
    vacatingDate: '2026-06-03',
    paidRentPeriods: [
      {
        periodStart: '2026-05-05',
        periodEnd: '2026-06-03',
        source: 'rent_invoice',
        paidPrincipalPaise: 300_000,
      },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, 3);
  assert.equal(breakdown.unusedPrepaidRentDays, 0);
  assert.equal(breakdown.chargeableNoticeDays, 3);
  assert.equal(breakdown.noticeDeductionPaise, 30_000);
});

test('fixed-stay booking: notice deduction policy does not apply', () => {
  assert.equal(
    noticeDeductionAppliesToBooking({ stayType: 'fixed_stay', durationMode: 'fixed_stay' }),
    false,
  );
});

test('resolvePaidThroughDate picks latest period extending past vacate', () => {
  const { paidUntilDate } = resolvePaidThroughDate('2026-06-15', [
    { periodStart: '2026-05-05', periodEnd: '2026-06-04', paidPrincipalPaise: 100_000 },
    { periodStart: '2026-06-05', periodEnd: '2026-07-04', paidPrincipalPaise: 100_000 },
  ]);
  assert.equal(paidUntilDate, '2026-07-04');
});

test('resolvePaidThroughDate prefers containing period over far-future extension', () => {
  const { paidUntilDate, periodUsed } = resolvePaidThroughDate('2026-08-15', [
    {
      periodStart: '2026-07-21',
      periodEnd: '2026-08-21',
      paidPrincipalPaise: 412_080,
    },
    {
      periodStart: '2098-12-21',
      periodEnd: '2099-01-05',
      paidPrincipalPaise: 10_000,
    },
  ]);
  assert.equal(paidUntilDate, '2026-08-21');
  assert.equal(periodUsed?.periodEnd, '2026-08-21');
});

test('unusedPrepaidRentDaysAfterVacating counts days after vacate through paid-until', () => {
  assert.equal(unusedPrepaidRentDaysAfterVacating('2026-06-15', '2026-06-30'), 15);
  assert.equal(unusedPrepaidRentDaysAfterVacating('2026-06-15', '2026-06-15'), 0);
  assert.equal(unusedPrepaidRentDaysAfterVacating('2026-06-15', null), 0);
});
