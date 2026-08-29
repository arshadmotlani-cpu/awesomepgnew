/**
 * Calendar-month move-out settlement — regression matrix (CV Laxminarayana class of bugs).
 *
 * SSOT: loadBillingCoverageModel → computeVacatingSettlementWaterfallFromContext
 *       → computeCheckoutSettlementV2
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  dailyRateFromBillingPeriod,
} from '@/src/lib/billing/billingCoverageModel';
import { assertCheckoutSettlementWaterfallConsistent } from '@/src/lib/checkout/settlementInvariants';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { diffDays } from '@/src/lib/dates';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';
import { resolveAdminMoveOutFinancialSummary } from '@/src/lib/vacating/adminMoveOutFinancialSummary';
import {
  computeVacatingSettlementWaterfallFromContext,
  type VacatingSettlementWaterfallContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';
import { resolveNoticeGivenDateForVacating } from '@/src/lib/vacating/noticeDateSsot';
import { unusedCalendarDaysAfterVacating } from '@/src/lib/vacating/calendarMonthPrepaidMoveOutSettlement';
import { dailyRateFromCalendarMonth, dailyRateFromMonthly } from '@/src/services/billing';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';

const CV_MOVE_IN = '2026-06-01';
const CV_MONTHLY_RENT = 714_000;
const CV_JULY_PAID = 721_140;
const CV_AUGUST_PAID = 721_140;
const CV_RENT_PAID = CV_JULY_PAID + CV_AUGUST_PAID;
const CV_DEPOSIT = 700_000;
const CV_NOTICE = '2026-08-25';
const CV_NOTICE_TS = '2026-08-25T10:00:00.000Z';
const CV_VACATE = '2026-09-03';

function cvPaidPeriods(includeSeptember = false) {
  const periods = [
    {
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
      paidPrincipalPaise: CV_JULY_PAID,
      source: 'rent_invoice' as const,
    },
    {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      paidPrincipalPaise: CV_AUGUST_PAID,
      source: 'rent_invoice' as const,
    },
  ];
  if (includeSeptember) {
    periods.push({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      paidPrincipalPaise: CV_MONTHLY_RENT,
      source: 'rent_invoice' as const,
    });
  }
  return periods;
}

function cvCoverage(vacatingDate: string, includeSeptember = false) {
  return buildBillingCoverageModel({
    bookingId: 'bk-cv-laxminarayana',
    moveInDate: CV_MOVE_IN,
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: cvPaidPeriods(includeSeptember),
    vacatingDate,
    noticeGivenDate: CV_NOTICE,
    monthlyRentPaise: CV_MONTHLY_RENT,
    rentReceivedPaise: includeSeptember ? CV_RENT_PAID + CV_MONTHLY_RENT : CV_RENT_PAID,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
}

function waterfallFromCoverage(coverage: ReturnType<typeof cvCoverage>) {
  const vacatingDate = coverage.vacatingDate!;
  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: coverage.moveInDate,
    vacatingDate,
    rentPaidPaise: coverage.paidInvoiceCoverage.reduce(
      (sum, p) => sum + (p.paidPrincipalPaise ?? 0),
      0,
    ),
    depositHeldPaise: CV_DEPOSIT,
    monthlyRentPaise: CV_MONTHLY_RENT,
    missingNoticeDays: coverage.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: 0,
    prepaidAfterVacatingPaise: coverage.prepaidAfterVacatingPaise,
    periodDailyRentPaise: dailyRateFromMonthly(CV_MONTHLY_RENT),
  };
  return { ctx, waterfall: computeVacatingSettlementWaterfallFromContext(ctx) };
}

test('CV Laxminarayana — long stay, Sep unpaid, Sep 3 move-out → unused prepaid ₹0, no ₹13,708 credit', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  const { waterfall } = waterfallFromCoverage(coverage);

  assert.equal(coverage.prepaidAfterVacatingPaise, 0);
  assert.equal(waterfall.rentBucket.unusedPaise, 0);
  assert.equal(waterfall.rentBucket.consumedPaise, CV_RENT_PAID);
  assert.notEqual(waterfall.refund.unusedRentPortionPaise, 1_370_800);
  assert.equal(waterfall.notice.fullPaise, 0);
  assert.equal(waterfall.notice.missingNoticeDays, 0);

  const tailDaily = dailyRateFromMonthly(CV_MONTHLY_RENT);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.equal(coverage.tailRentPaise, tailDaily * 3);
  assert.equal(waterfall.depositBucket.refundablePaise, CV_DEPOSIT);
  assert.equal(waterfall.refund.totalPaise, CV_DEPOSIT);

  assertCheckoutSettlementWaterfallConsistent(waterfall);
});

test('CV Laxminarayana — September prepaid → only Sep 4–30 unused prepaid', () => {
  const coverage = cvCoverage(CV_VACATE, true);
  const { waterfall } = waterfallFromCoverage(coverage);

  const unusedDays = unusedCalendarDaysAfterVacating(CV_VACATE, '2026-09-30');
  assert.equal(unusedDays, 27);
  assert.ok(waterfall.rentBucket.unusedPaise > 0);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);

  const sepDaily = dailyRateFromBillingPeriod(CV_MONTHLY_RENT, '2026-09-01', '2026-09-30');
  assert.equal(waterfall.rentBucket.unusedPaise, sepDaily * unusedDays);
  assertCheckoutSettlementWaterfallConsistent(waterfall);
});

test('check-in during current month with current month paid — only unused days in that month', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-mid-month',
    moveInDate: '2026-08-15',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      {
        periodStart: '2026-08-15',
        periodEnd: '2026-08-31',
        paidPrincipalPaise: 400_000,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: '2026-08-25',
    noticeGivenDate: '2026-08-20',
    monthlyRentPaise: 714_000,
    rentReceivedPaise: 400_000,
    treatAsApprovedForTail: true,
  });
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.ok(waterfall.rentBucket.unusedPaise >= 0);
  assert.ok(waterfall.rentBucket.unusedPaise <= coverage.prepaidAfterVacatingPaise);
  assertCheckoutSettlementWaterfallConsistent(waterfall);
});

test('months-earlier paid rent never becomes unused current-month credit', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.rentBucket.unusedPaise, 0);
  assert.equal(waterfall.rentBucket.paidPaise, CV_RENT_PAID);
  assert.equal(waterfall.rentBucket.consumedPaise, CV_RENT_PAID);
});

test('move-out inside a paid month — remaining paid days become unused prepaid', () => {
  const coverage = cvCoverage(CV_VACATE, true);
  assert.ok(coverage.prepaidAfterVacatingPaise > 0);
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.rentBucket.unusedPaise, coverage.prepaidAfterVacatingPaise);
});

test('move-out exactly on last paid day — unused prepaid zero', () => {
  const coverage = cvCoverage('2026-08-31', false);
  assert.equal(coverage.prepaidAfterVacatingPaise, 0);
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.rentBucket.unusedPaise, 0);
});

test('move-out after paid coverage with unpaid tail — no fake prepaid credit', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.rentBucket.unusedPaise, 0);
  assert.ok(coverage.tailRentPaise > 0);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
});

test('unpaid current month — occupied days are tail rent invoice, not unused credit', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.rentBucket.unusedPaise, 0);
  assert.equal(waterfall.depositBucket.refundablePaise, CV_DEPOSIT);
  assert.ok(coverage.tailRentPaise > 0);
});

test('notice fully satisfied — zero notice deduction (CV case)', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  assert.ok((coverage.noticeBreakdown?.missingNoticeDays ?? 0) === 0);
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.notice.fullPaise, 0);
  assert.equal(waterfall.notice.fromDepositPaise, 0);
});

test('notice shortfall — only missing days deducted', () => {
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-short-notice',
    moveInDate: CV_MOVE_IN,
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: cvPaidPeriods(true),
    vacatingDate: '2026-09-10',
    noticeGivenDate: '2026-09-08',
    monthlyRentPaise: CV_MONTHLY_RENT,
    rentReceivedPaise: CV_RENT_PAID + CV_MONTHLY_RENT,
    treatAsApprovedForTail: true,
  });
  const missing = coverage.noticeBreakdown?.missingNoticeDays ?? 0;
  assert.ok(missing > 0);
  const { waterfall } = waterfallFromCoverage(coverage);
  assert.equal(waterfall.notice.missingNoticeDays, missing);
  assert.equal(
    waterfall.notice.fullPaise,
    missing * dailyRateFromMonthly(CV_MONTHLY_RENT),
  );
});

test('electricity pending — estimate refund excludes finalized electricity', () => {
  const { waterfall } = waterfallFromCoverage(cvCoverage(CV_VACATE, false));
  const summary = buildResidentMoveOutRefundSummary(waterfall, { isEstimate: true });
  assert.equal(summary.electricityPending, true);
  assert.equal(summary.electricityDeductionPaise, 0);
  assert.equal(summary.estimatedRefundPaise, waterfall.refund.totalPaise);
});

test('deposit + tail rent display reconciles with refund summary', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  const { waterfall } = waterfallFromCoverage(coverage);
  const summary = buildResidentMoveOutRefundSummary(waterfall, {
    isEstimate: true,
    tailRentInvoicePaise: coverage.tailRentPaise,
  });
  assert.equal(summary.securityDepositPaise, CV_DEPOSIT);
  assert.equal(summary.tailRentPaise, coverage.tailRentPaise);
  assert.equal(summary.refundableDepositPaise, waterfall.depositBucket.refundablePaise);
  assert.equal(summary.unusedPrepaidRentPaise, 0);
  assert.equal(summary.estimatedRefundPaise, summary.refundableDepositPaise);
});

test('admin and resident summaries match for CV case', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  const { waterfall } = waterfallFromCoverage(coverage);
  const resident = buildResidentMoveOutRefundSummary(waterfall, {
    isEstimate: true,
    tailRentInvoicePaise: coverage.tailRentPaise,
  });
  const admin = resolveAdminMoveOutFinancialSummary(
    {
      vacatingRequestId: 'vr-cv',
      vacatingDate: CV_VACATE,
      depositHeldPaise: CV_DEPOSIT,
      deductionPaise: 0,
      electricityDeductionPaise: 0,
      estimatedRefundPaise: 0,
    } as MoveOutPipelineItemClient,
    {
      estimatedSettlement: {
        waterfall,
        estimatedRefundPaise: waterfall.refund.totalPaise,
        outstandingTailRentInvoicePaise: coverage.tailRentPaise,
      },
    } as never,
  );
  assert.equal(admin.securityDepositPaise, resident.securityDepositPaise);
  assert.equal(admin.tailRentPaise, resident.tailRentPaise);
  assert.equal(admin.refundableDepositPaise, resident.refundableDepositPaise);
  assert.equal(admin.estimatedRefundPaise, resident.estimatedRefundPaise);
  assert.equal(admin.unusedPrepaidRentPaise, 0);
});

test('unsafe lifetime-minus-consumption fallback is eliminated', () => {
  const daily = dailyRateFromMonthly(CV_MONTHLY_RENT);
  /** Old bug anchored stay to current billing period start (Sep 1), not move-in. */
  const bogusStayDays = diffDays('2026-09-01', CV_VACATE) + 1;
  const bogusConsumed = Math.min(CV_RENT_PAID, daily * bogusStayDays);
  const bogusUnused = Math.max(0, CV_RENT_PAID - bogusConsumed);
  assert.ok(bogusUnused > 1_000_000, 'old bug produced large bogus unused credit');

  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: CV_MOVE_IN,
    stayCheckoutDate: CV_VACATE,
    rentPaidPaise: CV_RENT_PAID,
    monthlyRentPaise: CV_MONTHLY_RENT,
    depositCollectedPaise: CV_DEPOSIT,
    missingNoticeDays: 0,
    prepaidAfterVacatingPaise: 0,
    checkoutTailRentPaise: daily * 3,
    periodDailyRentPaise: daily,
  });
  assert.notEqual(waterfall.rentBucket.unusedPaise, bogusUnused);
  assert.equal(waterfall.rentBucket.unusedPaise, 0);
});

test('changing vacating date does not mutate original notice timestamp SSOT', () => {
  const resolved = resolveNoticeGivenDateForVacating({
    noticeGivenDate: '2026-08-26',
    originalNoticeSubmittedAt: CV_NOTICE_TS,
  });
  assert.equal(resolved, CV_NOTICE);
  const coverageEarly = cvCoverage('2026-09-01', false);
  const coverageLate = cvCoverage(CV_VACATE, false);
  assert.equal(coverageEarly.noticeBreakdown?.missingNoticeDays, 0);
  assert.equal(coverageLate.noticeBreakdown?.missingNoticeDays, 0);
});

test('idempotent preview — same inputs produce identical paise', () => {
  const coverage = cvCoverage(CV_VACATE, false);
  const a = waterfallFromCoverage(coverage).waterfall;
  const b = waterfallFromCoverage(coverage).waterfall;
  assert.deepEqual(
    [
      a.rentBucket.unusedPaise,
      a.depositBucket.tailRentPaise,
      a.depositBucket.refundablePaise,
      a.refund.totalPaise,
    ],
    [
      b.rentBucket.unusedPaise,
      b.depositBucket.tailRentPaise,
      b.depositBucket.refundablePaise,
      b.refund.totalPaise,
    ],
  );
});

test('calendar month unpaid tail uses days-in-month daily rate (not monthly ÷ 30)', () => {
  const monthlyRentPaise = 310_000;
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-jan-tail',
    moveInDate: '2025-12-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      {
        periodStart: '2025-12-01',
        periodEnd: '2025-12-31',
        paidPrincipalPaise: monthlyRentPaise,
        source: 'rent_invoice',
      },
    ],
    vacatingDate: '2026-01-03',
    noticeGivenDate: '2025-12-20',
    monthlyRentPaise,
    treatAsApprovedForTail: true,
  });
  const janDaily = dailyRateFromCalendarMonth(monthlyRentPaise, '2026-01-01');
  assert.notEqual(janDaily, dailyRateFromMonthly(monthlyRentPaise));
  assert.equal(coverage.tailRent.tailDays, 3);
  assert.equal(coverage.tailRentPaise, janDaily * 3);
});

test('financial invariants — unused never exceeds prepaid coverage after vacate', () => {
  for (const includeSep of [false, true]) {
    const coverage = cvCoverage(CV_VACATE, includeSep);
    const { waterfall } = waterfallFromCoverage(coverage);
    assert.ok(waterfall.rentBucket.unusedPaise <= coverage.prepaidAfterVacatingPaise);
    assert.equal(waterfall.rentBucket.paidPaise, waterfall.rentBucket.consumedPaise + waterfall.rentBucket.unusedPaise);
    assert.equal(
      waterfall.refund.totalPaise,
      waterfall.depositBucket.refundablePaise + waterfall.refund.unusedRentPortionPaise,
    );
  }
});
