import { normalizeIsoDateOnly, tryDiffDays } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { AdminVacatingRow } from '@/src/db/queries/admin';
import {
  breakdownFromStoredNoticeSnapshot,
  toNoticeSettlementDisplay,
  type NoticeSettlementDisplay,
} from '@/src/lib/vacating/noticeDeductionPresentation';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export type VacatingBedStatus = 'Occupied' | 'Scheduled for Release' | 'Available';

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
  noticeBreakdown: NoticeSettlementDisplay | null;
};

export function vacatingBedStatus(
  status: AdminVacatingRow['status'],
): VacatingBedStatus {
  if (status === 'completed') return 'Available';
  if (status === 'approved') return 'Scheduled for Release';
  return 'Occupied';
}

export function buildVacatingApprovalPreview(
  row: AdminVacatingRow,
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
    deductionPaise: estimatedDeductionPaise,
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
  };
}

export type MoveOutUrgency = 'high' | 'medium' | 'normal';

/** 0–3 days → high, 4–7 → medium, 8+ → normal. Overdue counts as high. */
export function moveOutUrgency(daysRemaining: number): MoveOutUrgency {
  if (daysRemaining <= 3) return 'high';
  if (daysRemaining <= 7) return 'medium';
  return 'normal';
}

export function moveOutDaysRemaining(vacatingDate: string, today?: string): number {
  const ref = today ?? new Date().toISOString().slice(0, 10);
  return tryDiffDays(ref, normalizeIsoDateOnly(vacatingDate)) ?? 0;
}
