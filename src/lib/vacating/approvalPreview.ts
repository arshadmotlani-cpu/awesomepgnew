import { normalizeIsoDateOnly, tryDiffDays } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { AdminVacatingRow } from '@/src/db/queries/admin';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import {
  breakdownFromStoredNoticeSnapshot,
  type NoticeSettlementDisplay,
} from '@/src/lib/vacating/noticeDeductionPresentation';
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
  /** @deprecated Use estimatedSettlement */
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
  const noticeBreakdown = breakdownFromStoredNoticeSnapshot({
    noticeGivenDays: noticeCompletedDays,
    noticeGivenDate,
    vacatingDate,
    noticeRentCoveredDays: row.noticeRentCoveredDays,
    noticeChargeableDays: row.noticeChargeableDays,
    noticeDeductionPaise: estimatedDeductionPaise,
    noticeBreakdownJson: row.noticeBreakdownJson,
  });

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
    noticeBreakdown,
    estimatedSettlement: null,
  };
}

export async function buildVacatingApprovalPreviewAsync(
  row: VacatingApprovalPreviewRow,
  depositHeldPaise: number,
): Promise<VacatingApprovalPreview> {
  const sync = buildVacatingApprovalPreview(row, depositHeldPaise);
  const { loadEstimatedSettlementForVacating } = await import(
    '@/src/lib/vacating/estimatedSettlementPreview'
  );
  const estimatedSettlement = await loadEstimatedSettlementForVacating({
    bookingId: row.bookingId,
    noticeGivenDate: row.noticeGivenDate,
    vacatingDate: row.vacatingDate,
    monthlyRentPaiseSnapshot: row.monthlyRentPaiseSnapshot,
    noticeRentCoveredDays: row.noticeRentCoveredDays,
    noticeChargeableDays: row.noticeChargeableDays,
    deductionPaise: row.deductionPaise,
    noticeBreakdownJson: row.noticeBreakdownJson,
    stayType: row.stayType,
    durationMode: row.durationMode,
  });
  return { ...sync, estimatedSettlement };
}
