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
import { resolveNoticeGivenDateForVacating } from '@/src/lib/vacating/noticeDateSsot';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

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

/** When checkout amounts are locked, preserve BCM invoice tail — do not adopt legacy deposit tail. */
export function alignCoverageToLockedWaterfall(
  coverage: BillingCoverageModel,
  locked: CheckoutSettlementWaterfall,
): BillingCoverageModel {
  if (locked.depositBucket.tailRentPaise > 0 && !locked.outstandingRentInvoicePaise) {
    return coverage;
  }
  return coverage;
}

export function noticeDisplayFromBillingCoverage(
  coverage: BillingCoverageModel,
): NoticeSettlementDisplay {
  const notice = coverage.noticeBreakdown
    ? toNoticeSettlementDisplay(coverage.noticeBreakdown)
    : {
        noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
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
  const noticeGivenDate = resolveNoticeGivenDateForVacating({
    noticeGivenDate: input.noticeGivenDate,
    originalNoticeSubmittedAt: input.originalNoticeSubmittedAt,
  });
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

  let waterfall =
    precomputedWaterfall ??
    (ctx ? computeVacatingSettlementWaterfallFromContext(ctx) : null);
  if (!waterfall || !ctx) return null;

  const useLegacyLockedDepositTail =
    precomputedWaterfall != null &&
    precomputedWaterfall.depositBucket.tailRentPaise > 0 &&
    !precomputedWaterfall.outstandingRentInvoicePaise;

  if (precomputedWaterfall && !useLegacyLockedDepositTail) {
    coverage = alignCoverageToLockedWaterfall(coverage, precomputedWaterfall);
    ctx = {
      ...ctx,
      checkoutTailRentPaise: 0,
      missingNoticeDays: precomputedWaterfall.notice.missingNoticeDays,
    };
  }

  const { resolveFinalPeriodRentInvoiceOutstandingForBooking } = await import(
    '@/src/lib/checkout/checkoutSettlementV2Compute'
  );
  const invoiceOutstanding = await resolveFinalPeriodRentInvoiceOutstandingForBooking({
    bookingId: input.bookingId,
    vacatingDate,
  });
  const { canonicalOutstandingRentLiabilityPaise } = await import(
    '@/src/lib/vacating/canonicalRentThroughMoveOut'
  );
  // Move-out date is a billing boundary: never let preview/waterfall keep a
  // full-month unpaid face value when BCM already knows the prorated liability.
  const effectiveInvoiceOutstandingPaise = canonicalOutstandingRentLiabilityPaise({
    invoiceOutstandingPaise: invoiceOutstanding.outstandingPaise,
    paidPrincipalPaise: invoiceOutstanding.paidPrincipalPaise,
    tailRentPaise: coverage.tailRentPaise,
  });
  const outstandingTailRentInvoicePaise =
    invoiceOutstanding.invoiceId != null
      ? effectiveInvoiceOutstandingPaise
      : useLegacyLockedDepositTail
        ? precomputedWaterfall!.depositBucket.tailRentPaise
        : precomputedWaterfall?.outstandingRentInvoicePaise ?? coverage.tailRentPaise;

  if (!useLegacyLockedDepositTail) {
    ctx = {
      ...ctx,
      checkoutTailRentPaise: 0,
      outstandingRentInvoicePaise: effectiveInvoiceOutstandingPaise,
    };
    waterfall = computeVacatingSettlementWaterfallFromContext(ctx);
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
    outstandingTailRentInvoicePaise,
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
    outstandingTailRentInvoicePaise,
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
