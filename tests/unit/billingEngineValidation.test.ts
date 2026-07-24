import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
} from '@/src/lib/billing/billingCoverageModel';
import { validateBillingEngineSettlement } from '@/src/lib/billing/billingEngineValidation';
import { computeCheckoutSettlementV2 } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import {
  buildMoveOutSettlementExplanations,
} from '@/src/lib/vacating/moveOutSettlementExplanation';
import {
  buildVacatingSettlementPreviewSections,
  computeVacatingSettlementWaterfallFromContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';
import { noticeDisplayFromBillingCoverage, alignCoverageToLockedWaterfall } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import type { VacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import { ESTIMATED_REFUND_DISCLAIMER } from '@/src/lib/checkout/settlementDisplayFormat';
import { diffDays } from '@/src/lib/dates';

function fixturePresentation(vacatingDate: string): VacatingBillingPresentation {
  const moveInJul7 = '2026-07-07';
  const monthly387k = 387_000;
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-val',
    moveInDate: moveInJul7,
    billingDay: 7,
    rawPaidPeriods: [
      { periodStart: '2026-07-07', periodEnd: '2026-08-06', source: 'rent_invoice' },
    ],
    vacatingDate,
    noticeGivenDate: '2026-07-01',
    monthlyRentPaise: monthly387k,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
  const ctx = {
    checkInDate: moveInJul7,
    vacatingDate,
    rentPaidPaise: 412_100,
    depositHeldPaise: 412_100,
    monthlyRentPaise: monthly387k,
    missingNoticeDays: coverage.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: coverage.tailRentPaise,
  };
  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  const noticeDisplay = noticeDisplayFromBillingCoverage(coverage);
  const noticeGivenDays = Math.max(0, diffDays('2026-07-01', vacatingDate));
  const { sections, auditTrace, depositHeldPaise } = buildVacatingSettlementPreviewSections({
    notice: noticeDisplay,
    vacatingDate,
    noticeGivenDate: '2026-07-01',
    noticeGivenDays,
    waterfall,
    coverage,
    depositHeldPaise: ctx.depositHeldPaise,
    mode: 'estimate',
  });
  return {
    coverage,
    noticeDisplay,
    ctx,
    waterfall,
    estimatedSettlement: {
      sections,
      auditTrace,
      waterfall,
      estimatedRefundPaise: waterfall.refund.totalPaise,
      estimatedUnusedRentCreditPaise: waterfall.refund.unusedRentPortionPaise,
      estimatedRefundableDepositPaise: waterfall.depositBucket.refundablePaise,
      depositHeldPaise,
      disclaimer: ESTIMATED_REFUND_DISCLAIMER,
      mode: 'estimate',
    },
    billingCoverageDaysPaid: { label: '—', value: '—' },
  };
}

test('validateBillingEngineSettlement passes Case C fixture', () => {
  const presentation = fixturePresentation('2026-08-03');
  const report = buildMoveOutSettlementExplanations(presentation, {
    bookingId: 'bk-val',
    bookingCode: 'APG-TEST',
    residentName: 'Test',
  });
  const result = validateBillingEngineSettlement(report, presentation);
  assert.equal(result.ok, true, result.failures.map((f) => f.message).join('; '));
});

test('INV-N1 detects notice split mismatch', () => {
  const presentation = fixturePresentation('2026-08-08');
  const w = presentation.waterfall;
  const broken = {
    ...w,
    notice: {
      ...w.notice,
      fromDepositPaise: w.notice.fromDepositPaise + 100,
    },
  };
  const report = buildMoveOutSettlementExplanations(
    { ...presentation, waterfall: broken },
    { bookingId: 'bk', bookingCode: 'X', residentName: 'Y' },
  );
  const result = validateBillingEngineSettlement(report, { ...presentation, waterfall: broken });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.signature === 'NOTICE_SPLIT_MISMATCH'));
});

test('alignCoverageToLockedWaterfall prevents TAIL_MISMATCH when locked tail is zero', () => {
  const presentation = fixturePresentation('2026-08-08');
  const ctxZeroTail = { ...presentation.ctx, checkoutTailRentPaise: 0 };
  const lockedTailZero = computeVacatingSettlementWaterfallFromContext(ctxZeroTail);
  const aligned = alignCoverageToLockedWaterfall(presentation.coverage, lockedTailZero);
  assert.equal(aligned.tailRentPaise, 0);
  const noticeGivenDays = Math.max(0, diffDays('2026-07-01', '2026-08-08'));
  const { sections, auditTrace, depositHeldPaise } = buildVacatingSettlementPreviewSections({
    notice: presentation.noticeDisplay,
    vacatingDate: '2026-08-08',
    noticeGivenDate: '2026-07-01',
    noticeGivenDays,
    waterfall: lockedTailZero,
    coverage: aligned,
    depositHeldPaise: presentation.ctx.depositHeldPaise,
    mode: 'estimate',
  });
  const patched: VacatingBillingPresentation = {
    ...presentation,
    coverage: aligned,
    waterfall: lockedTailZero,
    ctx: ctxZeroTail,
    estimatedSettlement: {
      ...presentation.estimatedSettlement,
      sections,
      auditTrace,
      waterfall: lockedTailZero,
      estimatedRefundPaise: lockedTailZero.refund.totalPaise,
      estimatedUnusedRentCreditPaise: lockedTailZero.refund.unusedRentPortionPaise,
      estimatedRefundableDepositPaise: lockedTailZero.depositBucket.refundablePaise,
      depositHeldPaise,
    },
  };
  const report = buildMoveOutSettlementExplanations(patched, {
    bookingId: 'bk',
    bookingCode: 'X',
    residentName: 'Y',
  });
  const result = validateBillingEngineSettlement(report, patched);
  assert.equal(result.ok, true, result.failures.map((f) => f.message).join('; '));
});

test('INV-P1 detects negative paise', () => {
  const input = {
    stayCheckInDate: '2026-01-01',
    stayCheckoutDate: '2026-02-01',
    rentPaidPaise: 10_000,
    monthlyRentPaise: 30_000,
    depositCollectedPaise: 5_000,
    missingNoticeDays: 0,
    noticeApplies: false,
  };
  const w = computeCheckoutSettlementV2(input);
  const broken = { ...w, rentBucket: { ...w.rentBucket, unusedPaise: -1 } };
  const presentation = fixturePresentation('2026-08-08');
  const report = buildMoveOutSettlementExplanations(
    { ...presentation, waterfall: broken },
    { bookingId: 'bk', bookingCode: 'X', residentName: 'Y' },
  );
  const result = validateBillingEngineSettlement(report, { ...presentation, waterfall: broken });
  assert.ok(result.failures.some((f) => f.signature === 'NEGATIVE_PAISE'));
});
