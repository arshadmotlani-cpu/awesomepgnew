import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  dailyRateFromBillingPeriod,
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

test('waterfall invoice outstanding matches coverage for Case B', () => {
  const model = modelForVacate('2026-08-08');
  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: moveInJul7,
    vacatingDate: '2026-08-08',
    rentPaidPaise: 412_100,
    depositHeldPaise: 412_100,
    monthlyRentPaise: monthly387k,
    missingNoticeDays: model.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: 0,
    outstandingRentInvoicePaise: model.tailRentPaise,
  };
  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.equal(waterfall.outstandingRentInvoicePaise, model.tailRentPaise);
  assert.equal(
    waterfall.refund.totalPaise,
    waterfall.depositBucket.refundablePaise - model.tailRentPaise,
  );
});

/** APG-2026-0082 — move-in on invoice period end; full month rent at checkout; partial deposit. */
const moveInJul21 = '2026-07-21';
const billingDay21 = 21;
const monthly412080 = 412_080;
const deposit205900 = 205_900;

test('Case F — move-in checkout (0082): expand coverage, vacate in paid window, no tail', () => {
  const rawFirstInvoice = rawPeriodFromInvoiceDueDate('2026-07-21', billingDay21, 'inv-0082');
  assert.equal(rawFirstInvoice.periodEnd, moveInJul21);

  const model = buildBillingCoverageModel({
    bookingId: 'bk-0082',
    moveInDate: moveInJul21,
    billingDay: billingDay21,
    rawPaidPeriods: [rawFirstInvoice],
    vacatingDate: '2026-08-20',
    noticeGivenDate: '2026-07-23',
    monthlyRentPaise: monthly412080,
    rentReceivedPaise: monthly412080,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });

  assert.equal(model.paidInvoiceCoverage.length, 1);
  assert.equal(model.paidInvoiceCoverage[0]!.periodStart, moveInJul21);
  assert.equal(model.paidInvoiceCoverage[0]!.periodEnd, '2026-08-21');
  assert.equal(model.tailRentPaise, 0);
  assert.equal(model.finalInvoiceSuppression, false);

  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: moveInJul21,
    vacatingDate: '2026-08-20',
    rentPaidPaise: monthly412080,
    depositHeldPaise: deposit205900,
    monthlyRentPaise: monthly412080,
    missingNoticeDays: model.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: model.tailRentPaise,
    prepaidAfterVacatingPaise: model.prepaidAfterVacatingPaise,
  };
  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.equal(waterfall.depositBucket.collectedPaise, deposit205900);
  assert.equal(waterfall.depositBucket.refundablePaise, deposit205900);
  assert.equal(waterfall.refund.unusedRentPortionPaise, 0);
  assert.equal(waterfall.refund.totalPaise, deposit205900);
});

test('Case G — 0083-like: earlier vacate unlocks unused prepaid from paid period', () => {
  const rawFirstInvoice = rawPeriodFromInvoiceDueDate('2026-07-21', billingDay21, 'inv-0083');
  const paidPeriod = {
    ...rawFirstInvoice,
    paidPrincipalPaise: monthly412080,
  };

  const model20 = buildBillingCoverageModel({
    bookingId: 'bk-0083',
    moveInDate: moveInJul21,
    billingDay: billingDay21,
    rawPaidPeriods: [paidPeriod],
    vacatingDate: '2026-08-20',
    noticeGivenDate: '2026-07-23',
    monthlyRentPaise: monthly412080,
    rentReceivedPaise: monthly412080,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });

  const model15 = buildBillingCoverageModel({
    bookingId: 'bk-0083',
    moveInDate: moveInJul21,
    billingDay: billingDay21,
    rawPaidPeriods: [paidPeriod],
    vacatingDate: '2026-08-15',
    noticeGivenDate: '2026-07-23',
    monthlyRentPaise: monthly412080,
    rentReceivedPaise: monthly412080,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });

  assert.ok(model15.prepaidAfterVacatingDays > model20.prepaidAfterVacatingDays);
  assert.ok(model15.prepaidAfterVacatingPaise > model20.prepaidAfterVacatingPaise);
  assert.equal(model15.prepaidAfterVacatingDays, 6);
  assert.equal(model15.prepaidAfterVacatingPaise, 77_262);
  assert.equal(model20.prepaidAfterVacatingDays, 1);
  assert.equal(model20.prepaidAfterVacatingPaise, 12_877);

  const periodDaily0083 = dailyRateFromBillingPeriod(
    monthly412080,
    moveInJul21,
    '2026-08-21',
  );
  assert.equal(periodDaily0083, 12_877);

  const waterfall20 = computeVacatingSettlementWaterfallFromContext({
    checkInDate: moveInJul21,
    vacatingDate: '2026-08-20',
    rentPaidPaise: monthly412080,
    depositHeldPaise: deposit205900,
    monthlyRentPaise: monthly412080,
    missingNoticeDays: model20.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: model20.tailRentPaise,
    prepaidAfterVacatingPaise: model20.prepaidAfterVacatingPaise,
    periodDailyRentPaise: periodDaily0083,
  });
  const waterfall15 = computeVacatingSettlementWaterfallFromContext({
    checkInDate: moveInJul21,
    vacatingDate: '2026-08-15',
    rentPaidPaise: monthly412080,
    depositHeldPaise: deposit205900,
    monthlyRentPaise: monthly412080,
    missingNoticeDays: model15.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: model15.tailRentPaise,
    prepaidAfterVacatingPaise: model15.prepaidAfterVacatingPaise,
    periodDailyRentPaise: periodDaily0083,
  });

  assert.equal(waterfall20.depositBucket.collectedPaise, deposit205900);
  assert.equal(waterfall15.depositBucket.collectedPaise, deposit205900);
  assert.equal(waterfall20.rentBucket.consumedPaise, monthly412080 - model20.prepaidAfterVacatingPaise);
  assert.equal(waterfall20.refund.unusedRentPortionPaise, 12_877);
  assert.equal(waterfall20.refund.totalPaise, 218_777);
  assert.equal(waterfall15.stay.stayDays, 26);
  assert.equal(waterfall15.rentBucket.consumedPaise, monthly412080 - model15.prepaidAfterVacatingPaise);
  assert.equal(waterfall15.rentBucket.dailyRentPaise, 12_877);
  assert.equal(waterfall15.refund.unusedRentPortionPaise, 77_262);
  assert.equal(waterfall15.refund.totalPaise, 283_162);
  assert.ok(waterfall15.refund.totalPaise > waterfall20.refund.totalPaise);
});

test('Calendar policy — partial first month invoice coverage Sep 1–30', () => {
  const moveIn = '2026-08-15';
  const raw = rawPeriodFromInvoiceDueDate('2026-09-01', 1, 'inv-cal', {
    billingCyclePolicy: 'calendar_month_1st',
    billingMonth: '2026-09-01',
    moveInDate: moveIn,
  });
  assert.equal(raw.periodStart, '2026-09-01');
  assert.equal(raw.periodEnd, '2026-09-30');

  const partialRaw = rawPeriodFromInvoiceDueDate('2026-08-01', 1, 'inv-partial', {
    billingCyclePolicy: 'calendar_month_1st',
    billingMonth: '2026-08-01',
    moveInDate: moveIn,
  });
  assert.equal(partialRaw.periodStart, '2026-08-15');
  assert.equal(partialRaw.periodEnd, '2026-08-31');

  const model = buildBillingCoverageModel({
    bookingId: 'bk-cal',
    moveInDate: moveIn,
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      { ...partialRaw, paidPrincipalPaise: 200_000 },
      { ...raw, paidPrincipalPaise: 412_100 },
    ],
    vacatingDate: '2026-09-20',
    monthlyRentPaise: 412_100,
    treatAsApprovedForTail: true,
    noticeApplies: false,
  });
  assert.equal(model.billingCyclePolicy, 'calendar_month_1st');
  assert.ok(model.paidInvoiceCoverage.length >= 2);
});
