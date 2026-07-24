import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  clampPaidInvoiceCoverage,
  clampPaidPeriodToMoveIn,
  computeDaysPaidForSettlement,
  rawPeriodFromInvoiceDueDate,
} from '@/src/lib/billing/billingCoverageModel';

test('clampPaidPeriodToMoveIn never starts before check-in', () => {
  const raw = rawPeriodFromInvoiceDueDate('2026-07-07', 7, 'inv-1');
  assert.equal(raw.periodStart, '2026-06-07');
  assert.equal(raw.periodEnd, '2026-07-07');
  const clamped = clampPaidPeriodToMoveIn(raw, '2026-07-07');
  assert.ok(clamped);
  assert.equal(clamped!.periodStart, '2026-07-07');
  assert.equal(clamped!.periodEnd, '2026-07-07');
});

test('Krishna-like: notice has no prepaid after vacate but invoice coverage is clamped', () => {
  const raw = [
    rawPeriodFromInvoiceDueDate('2026-07-07', 7, 'inv-1'),
  ];
  const model = buildBillingCoverageModel({
    bookingId: 'bk',
    moveInDate: '2026-07-07',
    billingDay: 7,
    rawPaidPeriods: raw,
    vacatingDate: '2026-08-07',
    noticeGivenDate: '2026-07-24',
    monthlyRentPaise: 412_080,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });

  assert.equal(model.paidInvoiceCoverage.length, 1);
  assert.equal(model.paidInvoiceCoverage[0]!.periodStart, '2026-07-07');
  assert.doesNotMatch(model.paidInvoiceCoverage[0]!.periodStart, /2026-06/);
  assert.equal(model.paidUntilDate, null);
  assert.equal(model.prepaidAfterVacatingDays, 0);
  assert.ok(model.noticeBreakdown);
  assert.equal(model.noticeBreakdown!.paidPeriodUsed, null);
  assert.equal(model.daysPaidForSettlement, 1);
  assert.deepEqual(model.daysPaidSettlementPeriod, {
    periodStart: '2026-07-07',
    periodEnd: '2026-07-07',
  });
});

test('computeDaysPaidForSettlement unions coverage within stay', () => {
  const periods = clampPaidInvoiceCoverage(
    [
      { periodStart: '2026-07-07', periodEnd: '2026-07-31', source: 'rent_invoice' },
    ],
    '2026-07-07',
  );
  const { days, period } = computeDaysPaidForSettlement({
    moveInDate: '2026-07-07',
    vacatingDate: '2026-08-07',
    paidInvoiceCoverage: periods,
  });
  assert.equal(days, 25);
  assert.equal(period?.periodStart, '2026-07-07');
  assert.equal(period?.periodEnd, '2026-07-31');
});
