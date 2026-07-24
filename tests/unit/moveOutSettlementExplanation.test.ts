import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBillingCoverageModel,
  rawPeriodFromInvoiceDueDate,
} from '@/src/lib/billing/billingCoverageModel';
import { diffDays } from '@/src/lib/dates';
import {
  buildMoveOutSettlementExplanations,
  SETTLEMENT_EXPLANATION_LINE_IDS,
  validateMoveOutSettlementExplanations,
} from '@/src/lib/vacating/moveOutSettlementExplanation';
import {
  buildVacatingSettlementPreviewSections,
  computeVacatingSettlementWaterfallFromContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';
import { noticeDisplayFromBillingCoverage } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import type { VacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import { ESTIMATED_REFUND_DISCLAIMER } from '@/src/lib/checkout/settlementDisplayFormat';

const moveInJul7 = '2026-07-07';
const billingDay7 = 7;
const monthly387k = 387_000;
const paidJul7Aug6 = {
  periodStart: '2026-07-07',
  periodEnd: '2026-08-06',
  source: 'rent_invoice' as const,
};

function presentationForVacate(vacatingDate: string, rentPaidPaise = 412_100): VacatingBillingPresentation {
  const coverage = buildBillingCoverageModel({
    bookingId: 'bk-regression',
    moveInDate: moveInJul7,
    billingDay: billingDay7,
    rawPaidPeriods: [{ ...paidJul7Aug6 }],
    vacatingDate,
    noticeGivenDate: '2026-07-01',
    monthlyRentPaise: monthly387k,
    treatAsApprovedForTail: true,
    noticeApplies: true,
  });
  const ctx = {
    checkInDate: moveInJul7,
    vacatingDate,
    rentPaidPaise,
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
    billingCoverageDaysPaid: { value: '—' },
  };
}

function assertValid(presentation: VacatingBillingPresentation, vacatingDate: string) {
  const report = buildMoveOutSettlementExplanations(presentation, {
    bookingId: 'bk-regression',
    bookingCode: 'APG-TEST',
    residentName: 'Test Resident',
    vacatingRequestId: 'vr-test',
  });
  assert.equal(report.lines.length, SETTLEMENT_EXPLANATION_LINE_IDS.length);
  for (const line of report.lines) {
    assert.ok(line.formula.trim(), `${line.id} formula`);
    assert.ok(line.businessRule.trim(), `${line.id} rule`);
    assert.ok(line.source, `${line.id} source`);
  }
  const validation = validateMoveOutSettlementExplanations(report, presentation);
  assert.equal(validation.ok, true, validation.failures.map((f) => f.message).join('; '));
  assert.equal(report.vacatingDate, vacatingDate);
}

test('Case A — vacate 7 Aug: explanations complete and consistent', () => {
  assertValid(presentationForVacate('2026-08-07'), '2026-08-07');
});

test('Case B — vacate 8 Aug: tail rent explained', () => {
  const p = presentationForVacate('2026-08-08');
  assertValid(p, '2026-08-08');
  const tail = p.waterfall.depositBucket.tailRentPaise;
  assert.ok(tail > 0);
  const tailLine = buildMoveOutSettlementExplanations(p, {
    bookingId: 'bk',
    bookingCode: 'APG',
    residentName: 'R',
  }).lines.find((l) => l.id === 'tail_rent');
  assert.equal(tailLine?.valuePaise, tail);
});

test('Case C — vacate 3 Aug: no tail', () => {
  assertValid(presentationForVacate('2026-08-03'), '2026-08-03');
});

test('Case D — no paid invoices', () => {
  const coverage = buildBillingCoverageModel({
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
  const ctx = {
    checkInDate: moveInJul7,
    vacatingDate: '2026-08-07',
    rentPaidPaise: 0,
    depositHeldPaise: 50_000,
    monthlyRentPaise: monthly387k,
    missingNoticeDays: coverage.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: coverage.tailRentPaise,
  };
  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  const noticeDisplay = noticeDisplayFromBillingCoverage(coverage);
  const { sections, auditTrace, depositHeldPaise } = buildVacatingSettlementPreviewSections({
    notice: noticeDisplay,
    vacatingDate: '2026-08-07',
    noticeGivenDate: '2026-07-01',
    noticeGivenDays: 37,
    waterfall,
    coverage,
    depositHeldPaise: ctx.depositHeldPaise,
    mode: 'estimate',
  });
  const presentation: VacatingBillingPresentation = {
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
    billingCoverageDaysPaid: { value: '—' },
  };
  assertValid(presentation, '2026-08-07');
});

test('Case E — multiple paid invoices', () => {
  const raw = [
    rawPeriodFromInvoiceDueDate('2026-07-07', billingDay7, 'inv-1'),
    rawPeriodFromInvoiceDueDate('2026-08-07', billingDay7, 'inv-2'),
  ];
  const coverage = buildBillingCoverageModel({
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
  const ctx = {
    checkInDate: moveInJul7,
    vacatingDate: '2026-09-05',
    rentPaidPaise: 800_000,
    depositHeldPaise: 400_000,
    monthlyRentPaise: monthly387k,
    missingNoticeDays: coverage.noticeBreakdown?.missingNoticeDays ?? 0,
    noticeApplies: true,
    checkoutTailRentPaise: coverage.tailRentPaise,
  };
  const waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
  const noticeDisplay = noticeDisplayFromBillingCoverage(coverage);
  const { sections, auditTrace, depositHeldPaise } = buildVacatingSettlementPreviewSections({
    notice: noticeDisplay,
    vacatingDate: '2026-09-05',
    noticeGivenDate: '2026-07-01',
    noticeGivenDays: 66,
    waterfall,
    coverage,
    depositHeldPaise: ctx.depositHeldPaise,
    mode: 'estimate',
  });
  const presentation: VacatingBillingPresentation = {
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
    billingCoverageDaysPaid: { value: '—' },
  };
  assertValid(presentation, '2026-09-05');
});

test('EXPLANATION_GAP when line list is incomplete', () => {
  const p = presentationForVacate('2026-08-07');
  const report = buildMoveOutSettlementExplanations(p, {
    bookingId: 'bk',
    bookingCode: 'APG',
    residentName: 'R',
  });
  report.lines = report.lines.filter((l) => l.id !== 'tail_rent');
  const validation = validateMoveOutSettlementExplanations(report, p);
  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((f) => f.code === 'EXPLANATION_GAP'));
});
