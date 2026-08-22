import { normalizeIsoDateOnly, tryDiffDays, formatDate } from '@/src/lib/dates';
import { resolveNoticeGivenDateForVacating } from '@/src/lib/vacating/noticeDateSsot';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { AdminVacatingRow } from '@/src/db/queries/admin';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import type { MoveOutSettlementExplanationReport } from '@/src/lib/vacating/moveOutSettlementExplanation';
import {
  moveOutDaysRemaining,
  moveOutUrgency,
  vacatingBedStatus,
  type MoveOutUrgency,
  type VacatingBedStatus,
} from '@/src/lib/vacating/moveOutPreviewUtils';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export type { MoveOutUrgency, VacatingBedStatus };
export { moveOutDaysRemaining, moveOutUrgency, vacatingBedStatus };

export type VacatingApprovalPreviewRow = AdminVacatingRow & {
  noticeBreakdownJson?: Partial<NoticeDeductionBreakdown> | null;
};

export type VacatingApprovalPreview = {
  residentName: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  /** Calendar date used for notice-period calculation (immutable after submit). */
  noticeCalculationDate: string;
  /** Timestamp when resident first submitted the move-out request. */
  noticeSubmittedAt: string | null;
  /** @deprecated Use noticeCalculationDate — kept for settlement statement compat. */
  noticeSubmittedDate: string;
  moveOutDate: string;
  /** When admin opened/approved the request (null while pending). */
  processingDate: string | null;
  noticeRequiredDays: number;
  noticeCompletedDays: number;
  depositHeldPaise: number;
  estimatedDeductionPaise: number;
  estimatedRefundPaise: number;
  bedStatus: VacatingBedStatus;
  /** Coverage-derived notice display — same source as estimatedSettlement; never from stored JSON. */
  noticeBreakdown: NoticeSettlementDisplay | null;
  estimatedSettlement: EstimatedSettlementPreview | null;
  /** Per-amount explainability for review UI (formula, rule, source). */
  settlementExplanations?: MoveOutSettlementExplanationReport | null;
};

export function buildVacatingApprovalPreview(
  row: VacatingApprovalPreviewRow,
  depositHeldPaise: number,
): VacatingApprovalPreview {
  const noticeGivenDate = resolveNoticeGivenDateForVacating({
    noticeGivenDate: row.noticeGivenDate,
    originalNoticeSubmittedAt: row.originalNoticeSubmittedAt,
  });
  const vacatingDate = normalizeIsoDateOnly(row.vacatingDate);
  const noticeSpan = tryDiffDays(noticeGivenDate, vacatingDate);
  const noticeCompletedDays = Math.max(0, noticeSpan ?? 0);
  const estimatedDeductionPaise = guardDepositPaise(row.deductionPaise);
  const held = guardDepositPaise(depositHeldPaise);
  const estimatedRefundPaise = Math.max(0, held - estimatedDeductionPaise);
  const processingDateRaw = row.resolvedAt ?? (row.status === 'pending' ? row.updatedAt : null);
  const processingDate = processingDateRaw
    ? processingDateRaw instanceof Date
      ? formatDate(processingDateRaw)
      : normalizeIsoDateOnly(String(processingDateRaw))
    : null;

  return {
    residentName: row.customerFullName,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    noticeCalculationDate: noticeGivenDate,
    noticeSubmittedAt: row.originalNoticeSubmittedAt
      ? row.originalNoticeSubmittedAt.toISOString()
      : null,
    noticeSubmittedDate: noticeGivenDate,
    moveOutDate: vacatingDate,
    processingDate,
    noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
    noticeCompletedDays,
    depositHeldPaise: held,
    estimatedDeductionPaise,
    estimatedRefundPaise,
    bedStatus: vacatingBedStatus(row.status),
    noticeBreakdown: null,
    estimatedSettlement: null,
  };
}

export function applyEstimatedSettlementToApprovalPreview(
  sync: VacatingApprovalPreview,
  estimatedSettlement: EstimatedSettlementPreview | null,
  noticeBreakdown?: NoticeSettlementDisplay | null,
): VacatingApprovalPreview {
  if (!estimatedSettlement) return sync;
  const w = estimatedSettlement.waterfall;
  const depositHeld = estimatedSettlement.depositHeldPaise;
  const estimatedRefundPaise = estimatedSettlement.estimatedRefundPaise;
  const estimatedDeductionPaise = Math.max(0, depositHeld - w.depositBucket.refundablePaise);
  return {
    ...sync,
    estimatedSettlement,
    noticeBreakdown: noticeBreakdown ?? sync.noticeBreakdown,
    estimatedRefundPaise,
    estimatedDeductionPaise,
    depositHeldPaise: depositHeld,
  };
}

export async function buildVacatingApprovalPreviewAsync(
  row: VacatingApprovalPreviewRow,
  depositHeldPaise: number,
): Promise<VacatingApprovalPreview> {
  const sync = buildVacatingApprovalPreview(row, depositHeldPaise);
  const { loadVacatingBillingPresentationBundle } = await import(
    '@/src/lib/vacating/loadVacatingBillingPresentation'
  );
  const bundle = await loadVacatingBillingPresentationBundle({
    bookingId: row.bookingId,
    noticeGivenDate: resolveNoticeGivenDateForVacating({
      noticeGivenDate: row.noticeGivenDate,
      originalNoticeSubmittedAt: row.originalNoticeSubmittedAt,
    }),
    vacatingDate: row.vacatingDate,
    monthlyRentPaiseSnapshot: row.monthlyRentPaiseSnapshot,
    stayType: row.stayType,
    durationMode: row.durationMode,
    mode: 'estimate',
    treatAsApprovedForTail: true,
    explanationMeta: {
      bookingCode: row.bookingCode,
      residentName: row.customerFullName,
      vacatingRequestId: row.id,
    },
  });
  const base = applyEstimatedSettlementToApprovalPreview(
    sync,
    bundle?.estimatedSettlement ?? null,
    bundle?.noticeDisplay ?? null,
  );
  if (!bundle?.estimatedSettlement) return base;
  return { ...base, settlementExplanations: bundle.settlementExplanations };
}
