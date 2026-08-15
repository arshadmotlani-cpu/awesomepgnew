/**
 * Move-out state model — pure views for resident/admin surfaces.
 */
import { diffDays } from '@/src/lib/dates';
import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { buildResidentMoveOutRefundSummary } from '@/src/lib/residents/residentMoveOutRefundSummary';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export type DateChangeDirection = 'earlier' | 'later';

export type DateChangeFinancialImpact = {
  direction: DateChangeDirection;
  additionalStayDays: number;
  additionalRentPaise: number;
  unusedPrepaidRentPaise: number;
  refundDeltaPaise: number;
};

export type MoveOutResidentView = {
  originalNoticeSubmittedAt: string;
  originalNoticeGivenDate: string;
  originalVacatingDate: string;
  approvedFinalStayDate: string;
  pendingDateChange: {
    requestId: string;
    requestedDate: string;
    requestedAt: string;
    preview: VacatingDateChangePreview;
  } | null;
  noticeCompliantForPending: boolean;
  financialImpact: DateChangeFinancialImpact | null;
};

function waterfallRentOwed(w: CheckoutSettlementWaterfall): number {
  return w.rentBucket.consumedPaise + w.depositBucket.tailRentPaise;
}

/** Derive earlier/later financial impact from settlement waterfall diff. */
export function computeDateChangeFinancialImpact(
  preview: VacatingDateChangePreview,
): DateChangeFinancialImpact {
  const currentW = preview.currentEstimatedSettlement.waterfall;
  const requestedW = preview.requestedEstimatedSettlement.waterfall;
  const currentSummary = buildResidentMoveOutRefundSummary(currentW);
  const requestedSummary = buildResidentMoveOutRefundSummary(requestedW);

  const direction: DateChangeDirection =
    preview.requestedVacatingDate < preview.currentVacatingDate ? 'earlier' : 'later';

  const additionalStayDays =
    direction === 'later'
      ? Math.max(0, diffDays(preview.currentVacatingDate, preview.requestedVacatingDate))
      : 0;

  const currentRentOwed = waterfallRentOwed(currentW);
  const requestedRentOwed = waterfallRentOwed(requestedW);
  const additionalRentPaise =
    direction === 'later' ? Math.max(0, requestedRentOwed - currentRentOwed) : 0;

  const unusedPrepaidRentPaise =
    direction === 'earlier' ? requestedSummary.unusedPrepaidRentPaise : 0;

  return {
    direction,
    additionalStayDays,
    additionalRentPaise,
    unusedPrepaidRentPaise,
    refundDeltaPaise: preview.refundDeltaPaise,
  };
}

/** Enrich preview with notice history + financial impact fields. */
export function enrichVacatingDateChangePreview(
  preview: VacatingDateChangePreview,
  vacating: {
    noticeGivenDate: string | Date;
    originalNoticeSubmittedAt?: Date | string | null;
    originalVacatingDate?: string | Date | null;
  },
): VacatingDateChangePreview {
  const financialImpact = computeDateChangeFinancialImpact(preview);
  return {
    ...preview,
    direction: financialImpact.direction,
    additionalStayDays: financialImpact.additionalStayDays,
    additionalRentPaise: financialImpact.additionalRentPaise,
    unusedPrepaidRentPaise: financialImpact.unusedPrepaidRentPaise,
    noticeGivenDate: String(vacating.noticeGivenDate),
    originalNoticeSubmittedAt: vacating.originalNoticeSubmittedAt
      ? String(vacating.originalNoticeSubmittedAt)
      : null,
    originalVacatingDate: vacating.originalVacatingDate
      ? String(vacating.originalVacatingDate)
      : preview.currentVacatingDate,
    noticeComplianceLabel: preview.noticeCompliant
      ? `${VACATING_NOTICE_MIN_DAYS}-day notice requirement satisfied`
      : `${VACATING_NOTICE_MIN_DAYS}-day notice requirement not satisfied`,
  };
}

export function buildMoveOutResidentView(args: {
  vacating: {
    noticeGivenDate: string | Date;
    vacatingDate: string | Date;
    originalNoticeSubmittedAt?: Date | string | null;
    originalVacatingDate?: string | Date | null;
  };
  pendingDateChange: {
    id: string;
    requestedVacatingDate: string | Date;
    createdAt: Date;
    previewSnapshot: VacatingDateChangePreview | null;
  } | null;
}): MoveOutResidentView {
  const pendingPreview = args.pendingDateChange?.previewSnapshot;
  const financialImpact = pendingPreview ? computeDateChangeFinancialImpact(pendingPreview) : null;

  return {
    originalNoticeSubmittedAt: args.vacating.originalNoticeSubmittedAt
      ? String(args.vacating.originalNoticeSubmittedAt)
      : String(args.vacating.noticeGivenDate),
    originalNoticeGivenDate: String(args.vacating.noticeGivenDate),
    originalVacatingDate: args.vacating.originalVacatingDate
      ? String(args.vacating.originalVacatingDate)
      : String(args.vacating.vacatingDate),
    approvedFinalStayDate: String(args.vacating.vacatingDate),
    pendingDateChange: args.pendingDateChange
      ? {
          requestId: args.pendingDateChange.id,
          requestedDate: String(args.pendingDateChange.requestedVacatingDate),
          requestedAt: args.pendingDateChange.createdAt.toISOString(),
          preview: pendingPreview!,
        }
      : null,
    noticeCompliantForPending: pendingPreview?.noticeCompliant ?? false,
    financialImpact,
  };
}
