import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  rawPeriodFromInvoiceDueDate,
} from '@/src/lib/billing/billingCoverageModel';
import { computeVacatingFinalPeriodRentDecision } from '@/src/lib/billing/vacatingFinalPeriodRent';
import { dailyRateFromMonthly } from '@/src/services/billing';
import {
  computeVacatingSettlementWaterfallFromContext,
  type VacatingSettlementWaterfallContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';

const moveInJul7 = '2026-07-07';
const billingDay7 = 7;
const monthly387k = 387_000;
const paidJul7Aug6 = {
  periodStart: '2026-07-07',
  periodEnd: '2026-08-06',
  source: 'rent_invoice' as const,
};

function modelForVacate(vacatingDate: string, paidPeriods = [paidJul7Aug6]) {
  return buildBillingCoverageModel({
    bookingId: 'bk-regression',
    moveInDate: moveInJul7,
    billingDay: billingDay7,
    rawPaidPeriods: paidPeriods.map((p) => ({ ...p, source: 'rent_invoice' as const })),
    vacatingDate,
    noticeGivenDate: '2026-07-01',
    monthlyRentPaise: monthly387k,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
}

test('Case A — vacate 7 Aug: tail 0, no final invoice suppression', () => {
  const model = modelForVacate('2026-08-07');
  assert.equal(model.tailRentPaise, 0);
  assert.equal(model.finalInvoiceSuppression, false);
});

test('Case B — vacate 8 Aug: one tail day, invoice suppressed', () => {
  const model = modelForVacate('2026-08-08');
  assert.equal(model.finalInvoiceSuppression, true);
  assert.equal(model.tailRent.tailDays, 1);
  assert.equal(model.tailRentPaise, dailyRateFromMonthly(monthly387k));
});

test('Case C — vacate 3 Aug: no tail (inside paid period)', () => {
  const model = modelForVacate('2026-08-03');
  assert.equal(model.tailRentPaise, 0);
  assert.ok(model.noticeBreakdown);
});

test('Case D — no paid invoices: empty coverage, no prepaid credit', () => {
  const model = buildBillingCoverageModel({
    bookingId: 'bk-empty',
    moveInDate: moveInJul7,
    billingDay: billingDay7,
    rawPaidPeriods: [],
    vacatingDate: '2026-08-07',
    noticeGivenDate: '2026-07-01',
    monthlyRentPaise: monthly387k,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
  assert.equal(model.paidInvoiceCoverage.length, 0);
  assert.equal(model.prepaidAfterVacatingDays, 0);
  assert.equal(model.paidUntilDate, null);
});

test('Case E — multiple paid invoices: clamped coverage union', () => {
  const raw = [
    rawPeriodFromInvoiceDueDate('2026-07-07', billingDay7, 'inv-1'),
    rawPeriodFromInvoiceDueDate('2026-08-07', billingDay7, 'inv-2'),
  ];
  const model = buildBillingCoverageModel({
    bookingId: 'bk-multi',
    moveInDate: moveInJul7,
    billingDay: billingDay7,
    rawPaidPeriods: raw,
    vacatingDate: '2026-09-05',
    noticeGivenDate: '2026-07-01',
    monthlyRentPaise: monthly387k,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
  assert.ok(model.paidInvoiceCoverage.length >= 2);
  assert.ok(model.paidInvoiceCoverage.every((p) => p.periodStart >= moveInJul7));
  assert.ok(model.currentBillingPeriod?.periodStart);
});

test('tail decision Case B matches billing coverage model', () => {
  const decision = computeVacatingFinalPeriodRentDecision({
    vacatingApproved: true,
    vacatingDate: '2026-08-08',
    billingDay: billingDay7,
    moveInDate: moveInJul7,
    monthlyRentPaise: monthly387k,
    paidPeriods: [paidJul7Aug6],
  });
  const model = modelForVacate('2026-08-08');
  assert.equal(decision.tailRentPaise, model.tailRentPaise);
});

test('waterfall tail matches coverage for Case B', () => {
  const model = modelForVacate('2026-08-08');
  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: moveInJul7,
    vacatingDate: '2026-08-08',
    rentPaidPaise: 412_100,
    depositHeldPaise: 412_100,
    monthlyRentPaise: monthly387k,
    missingNoticeDays: model.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: model.tailRentPaise,
  };
  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  assert.equal(waterfall.depositBucket.tailRentPaise, model.tailRentPaise);
});
