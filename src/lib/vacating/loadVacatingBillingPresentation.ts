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

/** When checkout amounts are locked, BCM live tail can drift from stored waterfall — align for display/validation. */
export function alignCoverageToLockedWaterfall(
  coverage: BillingCoverageModel,
  locked: CheckoutSettlementWaterfall,
): BillingCoverageModel {
  const tailPaise = locked.depositBucket.tailRentPaise;
  return {
    ...coverage,
    tailRentPaise: tailPaise,
    finalInvoiceSuppression: tailPaise > 0 ? true : coverage.finalInvoiceSuppression,
    tailRent: {
      ...coverage.tailRent,
      tailRentPaise: tailPaise,
      tailDays: tailPaise > 0 ? coverage.tailRent.tailDays : 0,
      shouldSuppressFinalInvoice: tailPaise > 0,
    },
  };
}

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

  if (precomputedWaterfall) {
    coverage = alignCoverageToLockedWaterfall(coverage, precomputedWaterfall);
    ctx = {
      ...ctx,
      checkoutTailRentPaise: precomputedWaterfall.depositBucket.tailRentPaise,
      missingNoticeDays: precomputedWaterfall.notice.missingNoticeDays,
    };
  }

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

export type VacatingBillingPresentationBundle = VacatingBillingPresentation & {
  settlementExplanations: import('@/src/lib/vacating/moveOutSettlementExplanation').MoveOutSettlementExplanationReport;
};

/** Presentation + explainability report; validates when BILLING_ENGINE_STRICT=1. */
export async function loadVacatingBillingPresentationBundle(
  input: LoadVacatingBillingPresentationInput & {
    explanationMeta?: {
      bookingCode: string;
      residentName: string;
      vacatingRequestId?: string;
    };
  },
): Promise<VacatingBillingPresentationBundle | null> {
  const presentation = await loadVacatingBillingPresentation(input);
  if (!presentation) return null;

  const {
    buildMoveOutSettlementExplanations,
  } = await import('@/src/lib/vacating/moveOutSettlementExplanation');
  const { billingEngineStrictEnabled, validateBillingEngineSettlement } = await import(
    '@/src/lib/billing/billingEngineValidation'
  );

  const meta = input.explanationMeta ?? {
    bookingCode: input.bookingId,
    residentName: '—',
  };

  const settlementExplanations = buildMoveOutSettlementExplanations(presentation, {
    bookingId: input.bookingId,
    bookingCode: meta.bookingCode,
    residentName: meta.residentName,
    vacatingRequestId: meta.vacatingRequestId,
  });

  if (billingEngineStrictEnabled()) {
    const validation = validateBillingEngineSettlement(settlementExplanations, presentation, {
      lockedWaterfall: input.waterfall ?? null,
    });
    if (!validation.ok) {
      throw new Error(
        `Billing engine validation failed: ${validation.failures.map((f) => f.signature).join(', ')}`,
      );
    }
  }

  return { ...presentation, settlementExplanations };
}
