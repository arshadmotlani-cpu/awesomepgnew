import { tryDiffDays } from '@/src/lib/dates';
import type { AdminVacatingRow } from '@/src/db/queries/admin';
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
  const noticeSpan = tryDiffDays(row.noticeGivenDate, row.vacatingDate);
  const noticeCompletedDays = Math.max(0, noticeSpan ?? 0);
  const estimatedDeductionPaise = row.deductionPaise;
  const estimatedRefundPaise = Math.max(0, depositHeldPaise - estimatedDeductionPaise);

  return {
    residentName: row.customerFullName,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    noticeSubmittedDate: row.noticeGivenDate,
    moveOutDate: row.vacatingDate,
    noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
    noticeCompletedDays,
    depositHeldPaise,
    estimatedDeductionPaise,
    estimatedRefundPaise,
    bedStatus: vacatingBedStatus(row.status),
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
  return tryDiffDays(ref, vacatingDate) ?? 0;
}
