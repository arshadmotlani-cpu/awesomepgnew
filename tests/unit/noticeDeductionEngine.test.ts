import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildNoticeChargeWindow,
  computeNoticeDeductionBreakdown,
  dayIsCoveredByPaidRent,
  enumerateChargeWindowDays,
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

test('4 given / 10 missing, 6 days in window covered by paid invoice', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-05-01',
    vacatingDate: '2026-05-05',
    paidRentPeriods: [
      { periodStart: '2026-04-29', periodEnd: '2026-05-10', source: 'rent_invoice' },
    ],
  });
  assert.equal(breakdown.noticeGivenDays, 4);
  assert.equal(breakdown.missingNoticeDays, 10);
  assert.equal(breakdown.rentCoveredDays, 6);
  assert.equal(breakdown.chargeableNoticeDays, 4);
  assert.equal(breakdown.noticeDeductionPaise, 40_000);
});

test('0 given / 14 missing, 9 days covered → chargeable = 5', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-15',
    vacatingDate: '2026-06-15',
    paidRentPeriods: [
      { periodStart: '2026-06-06', periodEnd: '2026-06-30', source: 'rent_invoice' },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, 14);
  assert.equal(breakdown.rentCoveredDays, 9);
  assert.equal(breakdown.chargeableNoticeDays, 5);
});

test('all days in charge window covered → chargeable = 0', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-01',
    vacatingDate: '2026-06-08',
    paidRentPeriods: [
      { periodStart: '2026-06-01', periodEnd: '2026-06-30', source: 'rent_invoice' },
    ],
  });
  assert.equal(breakdown.missingNoticeDays, 7);
  assert.equal(breakdown.rentCoveredDays, 7);
  assert.equal(breakdown.chargeableNoticeDays, 0);
  assert.equal(breakdown.noticeDeductionPaise, 0);
});

test('no paid invoices: chargeable = missing (legacy behaviour)', () => {
  const breakdown = computeNoticeDeductionBreakdown({
    monthlyRentPaise: 300_000,
    noticeGivenDate: '2026-06-01',
    vacatingDate: '2026-06-08',
    paidRentPeriods: [],
  });
  assert.equal(breakdown.missingNoticeDays, 7);
  assert.equal(breakdown.chargeableNoticeDays, 7);
  assert.equal(breakdown.noticeDeductionPaise, 70_000);
});

test('fixed-stay booking: notice deduction policy does not apply', () => {
  assert.equal(
    noticeDeductionAppliesToBooking({ stayType: 'fixed_stay', durationMode: 'fixed_stay' }),
    false,
  );
});

test('buildNoticeChargeWindow: last N days before vacating (exclusive end)', () => {
  const window = buildNoticeChargeWindow('2026-06-15', 10);
  assert.equal(window.end, '2026-06-15');
  assert.equal(window.start, '2026-06-05');
  const days = enumerateChargeWindowDays(window.start, window.end);
  assert.equal(days.length, 10);
  assert.equal(days[0], '2026-06-05');
  assert.equal(days[9], '2026-06-14');
});

test('dayIsCoveredByPaidRent is inclusive on period bounds', () => {
  const periods = [{ periodStart: '2026-06-10', periodEnd: '2026-06-20' }];
  assert.equal(dayIsCoveredByPaidRent('2026-06-10', periods), true);
  assert.equal(dayIsCoveredByPaidRent('2026-06-20', periods), true);
  assert.equal(dayIsCoveredByPaidRent('2026-06-09', periods), false);
});
