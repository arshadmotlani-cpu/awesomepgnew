/**
 * Move-out preview — prorated paid rent must not invent unused prepaid credit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  dailyRateFromBillingPeriod,
  isInvoiceBillingPeriodWithinCalendarMonth,
  resolveCalendarMonthPaidCoveragePeriod,
} from '@/src/lib/billing/billingCoverageModel';
import { assertCheckoutSettlementWaterfallConsistent } from '@/src/lib/checkout/settlementInvariants';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { resolveCanonicalRentThroughMoveOut } from '@/src/lib/vacating/canonicalRentThroughMoveOut';
import {
  computeVacatingSettlementWaterfallFromContext,
  type VacatingSettlementWaterfallContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';
import { unusedCalendarDaysAfterVacating } from '@/src/lib/vacating/calendarMonthPrepaidMoveOutSettlement';
import { dailyRateFromMonthly } from '@/src/services/billing';

const MONTHLY = 721_140;
const DEPOSIT = 700_000;
const MOVE_IN = '2026-06-01';
const NOTICE = '2026-08-25';
const VACATE_PRORATED = '2026-09-11';
const SEP_PRORATED_PAISE = 264_418; // 11 days × (721140 / 30)

function paidThroughAugust() {
  return [
    {
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      paidPrincipalPaise: MONTHLY,
      source: 'rent_invoice' as const,
    },
    {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      paidPrincipalPaise: MONTHLY,
      source: 'rent_invoice' as const,
    },
  ];
}

function coverageWithSeptemberProratedPaid() {
  return buildBillingCoverageModel({
    bookingId: 'bk-prorated-sep',
    moveInDate: MOVE_IN,
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      ...paidThroughAugust(),
      {
        periodStart: '2026-09-01',
        periodEnd: VACATE_PRORATED,
        paidPrincipalPaise: SEP_PRORATED_PAISE,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: VACATE_PRORATED,
    noticeGivenDate: NOTICE,
    monthlyRentPaise: MONTHLY,
    rentReceivedPaise: MONTHLY * 2 + SEP_PRORATED_PAISE,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
}

function waterfallFromCoverage(coverage: ReturnType<typeof coverageWithSeptemberProratedPaid>) {
  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: coverage.moveInDate,
    vacatingDate: coverage.vacatingDate!,
    rentPaidPaise: coverage.paidInvoiceCoverage.reduce(
      (sum, p) => sum + (p.paidPrincipalPaise ?? 0),
      0,
    ),
    depositHeldPaise: DEPOSIT,
    monthlyRentPaise: MONTHLY,
    missingNoticeDays: coverage.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: coverage.tailRentPaise,
    prepaidAfterVacatingPaise: coverage.prepaidAfterVacatingPaise,
    periodDailyRentPaise: dailyRateFromMonthly(MONTHLY),
  };
  return { ctx, waterfall: computeVacatingSettlementWaterfallFromContext(ctx) };
}

test('loader resolver trusts in-month prorated notes (Sep 1–11)', () => {
  const period = resolveCalendarMonthPaidCoveragePeriod({
    billingMonth: '2026-09-01',
    billingDay: 1,
    invoiceId: 'inv-sep-prorated',
    notesPeriod: { periodStart: '2026-09-01', periodEnd: VACATE_PRORATED },
    moveInDate: MOVE_IN,
    dueDate: '2026-09-01',
    paidPrincipalPaise: SEP_PRORATED_PAISE,
  });
  assert.equal(period.periodStart, '2026-09-01');
  assert.equal(period.periodEnd, VACATE_PRORATED);
  assert.equal(period.paidPrincipalPaise, SEP_PRORATED_PAISE);
});

test('loader resolver ignores bad out-of-month notes and uses billing month', () => {
  const period = resolveCalendarMonthPaidCoveragePeriod({
    billingMonth: '2026-08-01',
    billingDay: 1,
    invoiceId: 'inv-angatra-aug',
    notesPeriod: { periodStart: '2026-07-01', periodEnd: '2026-08-01' },
    moveInDate: '2026-08-01',
    dueDate: '2026-08-01',
    paidPrincipalPaise: 463_590,
  });
  assert.equal(period.periodStart, '2026-08-01');
  assert.equal(period.periodEnd, '2026-08-31');
  assert.ok(
    !isInvoiceBillingPeriodWithinCalendarMonth(
      { periodStart: '2026-07-01', periodEnd: '2026-08-01' },
      '2026-08-01',
    ),
  );
});

test('paid prorated-through-move-out invoice → ₹0 unused prepaid', () => {
  const coverage = coverageWithSeptemberProratedPaid();
  assert.equal(coverage.prepaidAfterVacatingPaise, 0);
  assert.equal(coverage.prepaidAfterVacatingDays, 0);
  assert.equal(coverage.tailRentPaise, 0);

  const canonical = resolveCanonicalRentThroughMoveOut({
    monthlyRentPaise: MONTHLY,
    paidPrincipalPaise: SEP_PRORATED_PAISE,
    tailRentPaise: coverage.tailRentPaise,
    prepaidAfterVacatingPaise: coverage.prepaidAfterVacatingPaise,
  });
  assert.equal(canonical.unusedPrepaidRentPaise, 0);
  assert.equal(canonical.remainingRentLiabilityPaise, 0);
});

test('genuine full-month prepaid + early move-out → unused prepaid remains', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-full-sep',
    moveInDate: MOVE_IN,
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      ...paidThroughAugust(),
      {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        paidPrincipalPaise: MONTHLY,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: VACATE_PRORATED,
    noticeGivenDate: NOTICE,
    monthlyRentPaise: MONTHLY,
    rentReceivedPaise: MONTHLY * 3,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });

  const unusedDays = unusedCalendarDaysAfterVacating(VACATE_PRORATED, '2026-09-30');
  const sepDaily = dailyRateFromBillingPeriod(MONTHLY, '2026-09-01', '2026-09-30');
  assert.equal(unusedDays, 19);
  assert.equal(coverage.prepaidAfterVacatingPaise, sepDaily * unusedDays);
  assert.ok(coverage.prepaidAfterVacatingPaise > 400_000);
});

test('unpaid rent through move-out still calculates tail liability', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-unpaid-sep',
    moveInDate: MOVE_IN,
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: paidThroughAugust(),
    vacatingDate: VACATE_PRORATED,
    noticeGivenDate: NOTICE,
    monthlyRentPaise: MONTHLY,
    rentReceivedPaise: MONTHLY * 2,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });

  assert.equal(coverage.prepaidAfterVacatingPaise, 0);
  assert.ok(coverage.tailRentPaise > 0);
  const canonical = resolveCanonicalRentThroughMoveOut({
    monthlyRentPaise: MONTHLY,
    paidPrincipalPaise: 0,
    tailRentPaise: coverage.tailRentPaise,
    prepaidAfterVacatingPaise: 0,
  });
  assert.equal(canonical.unusedPrepaidRentPaise, 0);
  assert.equal(canonical.remainingRentLiabilityPaise, coverage.tailRentPaise);
});

test('deposit separate; electricity not invented on preview waterfall', () => {
  const coverage = coverageWithSeptemberProratedPaid();
  const { waterfall } = waterfallFromCoverage(coverage);

  assert.equal(waterfall.depositBucket.refundablePaise, DEPOSIT);
  assert.equal(waterfall.rentBucket.unusedPaise, 0);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.equal(waterfall.refund.totalPaise, DEPOSIT);
  assert.equal(waterfall.refund.unusedRentPortionPaise, 0);
  assertCheckoutSettlementWaterfallConsistent(waterfall);

  const checkout = computeCheckoutSettlementV2({
    stayCheckInDate: MOVE_IN,
    stayCheckoutDate: VACATE_PRORATED,
    rentPaidPaise: MONTHLY * 2 + SEP_PRORATED_PAISE,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: DEPOSIT,
    checkoutTailRentPaise: 0,
    prepaidAfterVacatingPaise: coverage.prepaidAfterVacatingPaise,
  });
  assert.equal(checkout.depositBucket.refundablePaise, DEPOSIT);
  assert.equal(checkout.refund.unusedRentPortionPaise, 0);
  assert.equal(checkout.refund.totalPaise, DEPOSIT);
});

test('preview waterfall and checkout settlement share canonical unused prepaid = 0', () => {
  const coverage = coverageWithSeptemberProratedPaid();
  const { ctx, waterfall } = waterfallFromCoverage(coverage);

  const checkout = computeCheckoutSettlementV2({
    stayCheckInDate: ctx.checkInDate,
    stayCheckoutDate: ctx.vacatingDate,
    rentPaidPaise: ctx.rentPaidPaise,
    monthlyRentPaise: ctx.monthlyRentPaise,
    depositCollectedPaise: ctx.depositHeldPaise,
    checkoutTailRentPaise: ctx.checkoutTailRentPaise,
    prepaidAfterVacatingPaise: ctx.prepaidAfterVacatingPaise,
    missingNoticeDays: ctx.missingNoticeDays,
    noticeApplies: ctx.noticeApplies,
    periodDailyRentPaise: ctx.periodDailyRentPaise,
  });

  assert.equal(waterfall.rentBucket.unusedPaise, checkout.rentBucket.unusedPaise);
  assert.equal(waterfall.refund.totalPaise, checkout.refund.totalPaise);
  assert.equal(waterfall.refund.totalPaise, DEPOSIT);
});
