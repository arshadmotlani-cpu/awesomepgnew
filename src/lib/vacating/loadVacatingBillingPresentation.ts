/**
 * Single server bundle: BillingCoverageModel + notice display + V2 waterfall + settlement preview.
 */
import { diffDays, normalizeIsoDateOnly } from '@/src/lib/dates';
import type { BillingCoverageModel } from '@/src/lib/billing/billingCoverageModel';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import {
  resolveDaysPaidFromBillingCoverage,
  type DaysPaidDisplayRow,
} from '@/src/lib/checkout/settlementDisplayFormat';
import {
  toNoticeSettlementDisplay,
  type NoticeSettlementDisplay,
} from '@/src/lib/vacating/noticeDeductionPresentation';
import { ESTIMATED_REFUND_DISCLAIMER } from '@/src/lib/checkout/settlementDisplayFormat';
import type {
  EstimatedSettlementPreview,
  EstimatedSettlementVacatingInput,
} from '@/src/lib/vacating/estimatedSettlementPreview';
import {
  buildVacatingSettlementPreviewSections,
  type VacatingSettlementWaterfallContext,
  computeVacatingSettlementWaterfallFromContext,
  loadVacatingSettlementWaterfallContext,
} from '@/src/lib/vacating/computeVacatingSettlementPreview';

export type { VacatingSettlementWaterfallContext };

export type LoadVacatingBillingPresentationInput = EstimatedSettlementVacatingInput & {
  treatAsApprovedForTail?: boolean;
  mode?: EstimatedSettlementPreview['mode'];
  /** When checkout detail already computed waterfall, pass it to skip recompute. */
  waterfall?: CheckoutSettlementWaterfall | null;
};

export type VacatingBillingPresentation = {
  coverage: BillingCoverageModel;
  noticeDisplay: NoticeSettlementDisplay;
  ctx: VacatingSettlementWaterfallContext;
  waterfall: CheckoutSettlementWaterfall;
  estimatedSettlement: EstimatedSettlementPreview;
  billingCoverageDaysPaid: DaysPaidDisplayRow;
};

export function noticeDisplayFromBillingCoverage(
  coverage: BillingCoverageModel,
): NoticeSettlementDisplay {
  const notice = coverage.noticeBreakdown
    ? toNoticeSettlementDisplay(coverage.noticeBreakdown)
    : {
        noticeRequiredDays: 14,
        noticeGivenDays: 0,
        missingNoticeDays: 0,
        billingDay: coverage.billingDay,
        billingCycleLabel: '—',
        paidUntilDate: null,
        vacatingDate: coverage.vacatingDate ?? '',
        unusedPrepaidRentDays: 0,
        noticeCoveredByPrepaidRent: 0,
        chargeableNoticeDays: 0,
        noticeDeductionPaise: 0,
      };
  return {
    ...notice,
    billingDay: coverage.billingDay,
    paidUntilDate: coverage.paidUntilDate,
    billingCycleLabel:
      coverage.currentBillingPeriod?.label ??
      (coverage.paidInvoiceCoverage[0]
        ? `${coverage.paidInvoiceCoverage[0].periodStart} → ${coverage.paidInvoiceCoverage[0].periodEnd}`
        : notice.billingCycleLabel),
  };
}

export async function loadVacatingBillingPresentation(
  input: LoadVacatingBillingPresentationInput,
): Promise<VacatingBillingPresentation | null> {
  const vacatingDate = normalizeIsoDateOnly(input.vacatingDate);
  const noticeGivenDate = normalizeIsoDateOnly(input.noticeGivenDate);
  if (!vacatingDate) return null;

  const precomputedWaterfall = input.waterfall ?? null;
  const computed = precomputedWaterfall
    ? null
    : await loadVacatingSettlementWaterfallContext({
        ...input,
        vacatingDate,
        noticeGivenDate,
      });

  let coverage = computed?.coverage ?? null;
  let ctx = computed?.ctx ?? null;

  if (!coverage) {
    const loaded = await loadVacatingSettlementWaterfallContext({
      ...input,
      vacatingDate,
      noticeGivenDate,
    });
    if (!loaded) return null;
    coverage = loaded.coverage;
    ctx = loaded.ctx;
  }

  const waterfall =
    precomputedWaterfall ??
    (ctx ? computeVacatingSettlementWaterfallFromContext(ctx) : null);
  if (!waterfall || !ctx) return null;

  const noticeDisplay = noticeDisplayFromBillingCoverage(coverage);
  const billingCoverageDaysPaid = resolveDaysPaidFromBillingCoverage(coverage);
  const noticeGivenDays =
    noticeDisplay.noticeGivenDays ?? Math.max(0, diffDays(noticeGivenDate, vacatingDate));
  const mode = input.mode ?? 'estimate';

  const { sections, auditTrace, depositHeldPaise } = buildVacatingSettlementPreviewSections({
    notice: noticeDisplay,
    vacatingDate,
    noticeGivenDate,
    noticeGivenDays,
    waterfall,
    coverage,
    depositHeldPaise: ctx.depositHeldPaise,
    mode,
  });

  const estimatedSettlement: EstimatedSettlementPreview = {
    sections,
    auditTrace,
    waterfall,
    estimatedRefundPaise: waterfall.refund.totalPaise,
    estimatedUnusedRentCreditPaise: waterfall.refund.unusedRentPortionPaise,
    estimatedRefundableDepositPaise: waterfall.depositBucket.refundablePaise,
    depositHeldPaise,
    disclaimer: ESTIMATED_REFUND_DISCLAIMER,
    mode,
  };

  return {
    coverage,
    noticeDisplay,
    ctx,
    waterfall,
    estimatedSettlement,
    billingCoverageDaysPaid,
  };
}
