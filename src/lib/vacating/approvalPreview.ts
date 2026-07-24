import { normalizeIsoDateOnly, tryDiffDays } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { AdminVacatingRow } from '@/src/db/queries/admin';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import type { NoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
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
  noticeSubmittedDate: string;
  moveOutDate: string;
  noticeRequiredDays: number;
  noticeCompletedDays: number;
  depositHeldPaise: number;
  estimatedDeductionPaise: number;
  estimatedRefundPaise: number;
  bedStatus: VacatingBedStatus;
  /** Coverage-derived notice display — same source as estimatedSettlement; never from stored JSON. */
  noticeBreakdown: NoticeSettlementDisplay | null;
  estimatedSettlement: EstimatedSettlementPreview | null;
};

export function buildVacatingApprovalPreview(
  row: VacatingApprovalPreviewRow,
  depositHeldPaise: number,
): VacatingApprovalPreview {
  const noticeGivenDate = normalizeIsoDateOnly(row.noticeGivenDate);
  const vacatingDate = normalizeIsoDateOnly(row.vacatingDate);
  const noticeSpan = tryDiffDays(noticeGivenDate, vacatingDate);
  const noticeCompletedDays = Math.max(0, noticeSpan ?? 0);
  const estimatedDeductionPaise = guardDepositPaise(row.deductionPaise);
  const held = guardDepositPaise(depositHeldPaise);
  const estimatedRefundPaise = Math.max(0, held - estimatedDeductionPaise);

  return {
    residentName: row.customerFullName,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    noticeSubmittedDate: noticeGivenDate,
    moveOutDate: vacatingDate,
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
  const { loadVacatingBillingPresentation } = await import(
    '@/src/lib/vacating/loadVacatingBillingPresentation'
  );
  const presentation = await loadVacatingBillingPresentation({
    bookingId: row.bookingId,
    noticeGivenDate: row.noticeGivenDate,
    vacatingDate: row.vacatingDate,
    monthlyRentPaiseSnapshot: row.monthlyRentPaiseSnapshot,
    stayType: row.stayType,
    durationMode: row.durationMode,
    mode: 'estimate',
  });
  return applyEstimatedSettlementToApprovalPreview(
    sync,
    presentation?.estimatedSettlement ?? null,
    presentation?.noticeDisplay ?? null,
  );
}
