import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  computeNoticeDeductionBreakdown,
  resolvePaidThroughDate,
  unusedPrepaidRentDaysAfterVacating,
} from '../../src/lib/vacating/noticeDeductionEngine';
import { noticeDeductionAppliesToBooking } from '../../src/lib/checkout/noticeDeductionPolicy';

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

test('10 missing notice, 19 unused prepaid days → fully covered', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-05-01',
    vacatingDate: '2026-05-05',
    paidRentPeriods: [
      { periodStart: '2026-04-05', periodEnd: '2026-05-24', source: 'rent_invoice' },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, 10);
  assert.equal(breakdown.unusedPrepaidRentDays, 19);
  assert.equal(breakdown.noticeCoveredByPrepaidRent, 10);
  assert.equal(breakdown.chargeableNoticeDays, 0);
  assert.equal(breakdown.noticeDeductionPaise, 0);
});

test('10 missing notice, 5 unused prepaid days → chargeable = 5', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-05-01',
    vacatingDate: '2026-05-05',
    paidRentPeriods: [
      { periodStart: '2026-04-05', periodEnd: '2026-05-10', source: 'rent_invoice' },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, 10);
  assert.equal(breakdown.unusedPrepaidRentDays, 5);
  assert.equal(breakdown.noticeCoveredByPrepaidRent, 5);
  assert.equal(breakdown.chargeableNoticeDays, 5);
  assert.equal(breakdown.noticeDeductionPaise, 50_000);
});

test('14 missing notice, 15 unused prepaid → chargeable = 0', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-15',
    vacatingDate: '2026-06-15',
    paidRentPeriods: [
      { periodStart: '2026-06-05', periodEnd: '2026-06-30', source: 'rent_invoice' },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, 14);
  assert.equal(breakdown.unusedPrepaidRentDays, 15);
  assert.equal(breakdown.noticeCoveredByPrepaidRent, 14);
  assert.equal(breakdown.chargeableNoticeDays, 0);
});

test('no prepaid after vacate: chargeable = missing notice days', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-01',
    vacatingDate: '2026-06-08',
    paidRentPeriods: [
      { periodStart: '2026-05-05', periodEnd: '2026-06-07', source: 'rent_invoice' },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, 7);
  assert.equal(breakdown.unusedPrepaidRentDays, 0);
  assert.equal(breakdown.chargeableNoticeDays, 7);
  assert.equal(breakdown.noticeDeductionPaise, 70_000);
});

test('fixed-stay booking: notice deduction policy does not apply', () => {
  assert.equal(
    noticeDeductionAppliesToBooking({ stayType: 'fixed_stay', durationMode: 'fixed_stay' }),
    false,
  );
});

test('resolvePaidThroughDate picks latest period extending past vacate', () => {
  const { paidUntilDate } = resolvePaidThroughDate('2026-06-15', [
    { periodStart: '2026-05-05', periodEnd: '2026-06-04' },
    { periodStart: '2026-06-05', periodEnd: '2026-07-04' },
  ]);
  assert.equal(paidUntilDate, '2026-07-04');
});

test('unusedPrepaidRentDaysAfterVacating counts days after vacate through paid-until', () => {
  assert.equal(unusedPrepaidRentDaysAfterVacating('2026-06-15', '2026-06-30'), 15);
  assert.equal(unusedPrepaidRentDaysAfterVacating('2026-06-15', '2026-06-15'), 0);
  assert.equal(unusedPrepaidRentDaysAfterVacating('2026-06-15', null), 0);
});
