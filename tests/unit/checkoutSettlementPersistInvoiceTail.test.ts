/**
 * Checkout settlement persistence — invoice-based final-period rent (not deposit tail).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
} from '@/src/lib/billing/billingCoverageModel';
import {
  computeCheckoutSettlementV2,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';
import {
  computeWaterfallWithApprovalBaseline,
  waterfallToLegacyPreview,
} from '@/src/lib/checkout/checkoutSettlementV2Compute';
import { assertCheckoutSettlementWaterfallConsistent } from '@/src/lib/checkout/settlementInvariants';
import {
  computeVacatingSettlementWaterfallFromContext,
  type VacatingSettlementWaterfallContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';
import { dailyRateFromMonthly, fullMonthlyRentPaise } from '@/src/services/billing';
import { resolveVacatingAwareRentCharge } from '@/src/lib/billing/billingCoverageModel';

const CV_MONTHLY = 714_000;
const CV_DEPOSIT = 700_000;
const CV_JULY_PAID = 721_140;
const CV_AUGUST_PAID = 721_140;
const CV_RENT_PAID = CV_JULY_PAID + CV_AUGUST_PAID;

function cvPersistWaterfall(outstandingInvoicePaise: number) {
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-cv',
    moveInDate: '2026-06-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    rawPaidPeriods: [
      { periodStart: '2026-07-01', periodEnd: '2026-07-31', paidPrincipalPaise: CV_JULY_PAID, source: 'rent_invoice' },
      { periodStart: '2026-08-01', periodEnd: '2026-08-31', paidPrincipalPaise: CV_AUGUST_PAID, source: 'rent_invoice' },
    ],
    vacatingDate: '2026-09-03',
    noticeGivenDate: '2026-08-25',
    monthlyRentPaise: CV_MONTHLY,
    rentReceivedPaise: CV_RENT_PAID,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });

  const ctx: VacatingSettlementWaterfallContext = {
    checkInDate: '2026-06-01',
    vacatingDate: '2026-09-03',
    rentPaidPaise: CV_RENT_PAID,
    depositHeldPaise: CV_DEPOSIT,
    monthlyRentPaise: CV_MONTHLY,
    missingNoticeDays: 0,
    noticeApplies: true,
    checkoutTailRentPaise: 0,
    outstandingRentInvoicePaise: outstandingInvoicePaise,
    prepaidAfterVacatingPaise: coverage.prepaidAfterVacatingPaise,
    periodDailyRentPaise: dailyRateFromMonthly(CV_MONTHLY),
  };

  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  assertCheckoutSettlementWaterfallConsistent(waterfall);
  return { coverage, waterfall };
}

test('CV Laxminarayana persist path — invoice ₹714, deposit ₹7,000, no deposit tail', () => {
  const tailDaily = dailyRateFromMonthly(CV_MONTHLY);
  const invoiceOutstanding = tailDaily * 3;
  assert.equal(invoiceOutstanding, 71_400);

  const { coverage, waterfall } = cvPersistWaterfall(invoiceOutstanding);

  assert.equal(coverage.prepaidAfterVacatingPaise, 0);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.equal(waterfall.depositBucket.refundablePaise, CV_DEPOSIT);
  assert.equal(waterfall.outstandingRentInvoicePaise, invoiceOutstanding);
  assert.equal(waterfall.refund.totalPaise, CV_DEPOSIT - invoiceOutstanding);

  const preview = waterfallToLegacyPreview(waterfall, CV_DEPOSIT);
  assert.equal(preview.outstandingRentDeductionPaise, invoiceOutstanding);
  assert.equal(preview.depositRefundablePaise, CV_DEPOSIT);
  assert.equal(preview.finalRefundPaise, CV_DEPOSIT - invoiceOutstanding);
});

test('CV — no double charge: deposit tail zero when invoice outstanding present', () => {
  const invoiceOutstanding = 71_400;
  const { waterfall } = cvPersistWaterfall(invoiceOutstanding);
  assert.equal(waterfall.depositBucket.tailRentPaise, 0);
  assert.ok(waterfall.outstandingRentInvoicePaise! > 0);
  assert.equal(
    waterfall.depositBucket.refundablePaise + waterfall.outstandingRentInvoicePaise!,
    CV_DEPOSIT + invoiceOutstanding,
  );
});

test('Jan paid → Feb 2 vacate — prorated invoice charge, persist checkoutTailRentPaise 0', () => {
  const MONTHLY = 714_000;
  const FULL = fullMonthlyRentPaise(MONTHLY);
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: [
      {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        paidPrincipalPaise: FULL,
        source: 'rent_invoice',
      },
    ],
    activeVacating: { status: 'approved', vacatingDate: '2026-02-02' },
    fullMonthRentPaise: FULL,
    billingPeriod: { periodStart: '2026-02-01', periodEnd: '2026-02-28' },
  });

  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2025-06-01',
    stayCheckoutDate: '2026-02-02',
    rentPaidPaise: FULL,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: 500_000,
    checkoutTailRentPaise: 0,
    outstandingRentInvoicePaise: charge.chargeablePaise,
  });
  assert.equal(w.depositBucket.tailRentPaise, 0);
  assert.equal(w.depositBucket.refundablePaise, 500_000);
  assert.equal(w.outstandingRentInvoicePaise, charge.chargeablePaise);
});

test('full-month invoice → vacate Feb 5 adjusts charge without deposit tail', () => {
  const MONTHLY = 714_000;
  const FULL = fullMonthlyRentPaise(MONTHLY);
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: [
      {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        paidPrincipalPaise: FULL,
        source: 'rent_invoice',
      },
    ],
    activeVacating: { status: 'approved', vacatingDate: '2026-02-05' },
    fullMonthRentPaise: FULL,
    billingPeriod: { periodStart: '2026-02-01', periodEnd: '2026-02-28' },
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: FULL,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });
  assert.equal(charge.billingAction, 'adjust_existing');
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2025-06-01',
    stayCheckoutDate: '2026-02-05',
    rentPaidPaise: FULL,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: 500_000,
    checkoutTailRentPaise: 0,
    outstandingRentInvoicePaise: charge.chargeablePaise,
  });
  assert.equal(w.depositBucket.tailRentPaise, 0);
  assert.equal(w.outstandingRentInvoicePaise, charge.chargeablePaise);
});

test('partial payment — invoice outstanding below paid principal blocked at BCM; persist uses actual outstanding', () => {
  const MONTHLY = 714_000;
  const FULL = fullMonthlyRentPaise(MONTHLY);
  const charge = resolveVacatingAwareRentCharge({
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st',
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: [
      {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        paidPrincipalPaise: FULL,
        source: 'rent_invoice',
      },
    ],
    activeVacating: { status: 'approved', vacatingDate: '2026-02-02' },
    fullMonthRentPaise: FULL,
    billingPeriod: { periodStart: '2026-02-01', periodEnd: '2026-02-28' },
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: FULL,
      paidPrincipalPaise: 500_000,
      status: 'partial',
    },
  });
  assert.equal(charge.billingAction, 'no_change');
  const actualOutstanding = FULL - 500_000;
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2025-06-01',
    stayCheckoutDate: '2026-02-02',
    rentPaidPaise: FULL,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: 500_000,
    checkoutTailRentPaise: 0,
    outstandingRentInvoicePaise: actualOutstanding,
  });
  assert.equal(w.depositBucket.tailRentPaise, 0);
  assert.equal(w.outstandingRentInvoicePaise, actualOutstanding);
});

test('date change idempotency — same chargeable paise yields no_change then stable persist', () => {
  const MONTHLY = 714_000;
  const FULL = fullMonthlyRentPaise(MONTHLY);
  const base = {
    billingMonth: '2026-02-01',
    billingDay: 1,
    billingCyclePolicy: 'calendar_month_1st' as const,
    moveInDate: '2025-06-01',
    monthlyRentPaise: MONTHLY,
    paidInvoiceCoverage: [
      {
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        paidPrincipalPaise: FULL,
        source: 'rent_invoice' as const,
      },
    ],
    activeVacating: { status: 'approved' as const, vacatingDate: '2026-02-05' },
    fullMonthRentPaise: FULL,
    billingPeriod: { periodStart: '2026-02-01', periodEnd: '2026-02-28' },
  };
  const first = resolveVacatingAwareRentCharge(base);
  const second = resolveVacatingAwareRentCharge({
    ...base,
    existingInvoice: {
      id: 'inv-feb',
      rentPaise: first.chargeablePaise,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });
  assert.equal(second.billingAction, 'no_change');
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2025-06-01',
    stayCheckoutDate: '2026-02-05',
    rentPaidPaise: FULL,
    monthlyRentPaise: MONTHLY,
    depositCollectedPaise: 500_000,
    checkoutTailRentPaise: 0,
    outstandingRentInvoicePaise: first.chargeablePaise,
  });
  assert.equal(w.depositBucket.tailRentPaise, 0);
});

test('legacy locked baseline preserves historical deposit tail via computeWaterfallWithApprovalBaseline', () => {
  const legacyBaseline = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: '2026-09-03',
    rentPaidPaise: CV_RENT_PAID,
    monthlyRentPaise: CV_MONTHLY,
    depositCollectedPaise: CV_DEPOSIT,
    checkoutTailRentPaise: 71_400,
    electricityPaise: 0,
  });
  assert.equal(legacyBaseline.depositBucket.tailRentPaise, 71_400);

  const replayed = computeWaterfallWithApprovalBaseline({
    baseline: legacyBaseline,
    settlement: {
      monthlyRentPaiseSnapshot: CV_MONTHLY,
      electricityDeductFromDeposit: true,
      damageChargePaise: 0,
      cleaningChargePaise: 0,
      customChargePaise: 0,
    } as import('@/src/db/schema').CheckoutSettlement,
    depositHeldPaise: CV_DEPOSIT,
  });
  assert.equal(replayed.depositBucket.tailRentPaise, 71_400);
  assert.equal(replayed.depositBucket.refundablePaise, CV_DEPOSIT - 71_400);
});
