import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import { noticeShortfallDays, VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export type NoticeDeductionDisplayBreakdown = Pick<
  NoticeDeductionBreakdown,
  | 'noticeRequiredDays'
  | 'noticeGivenDays'
  | 'missingNoticeDays'
  | 'rentCoveredDays'
  | 'chargeableNoticeDays'
  | 'noticeDeductionPaise'
>;

export function breakdownFromStoredNoticeSnapshot(row: {
  noticeRequiredDays?: number;
  noticeGivenDays?: number;
  noticeGivenDate?: string;
  vacatingDate?: string;
  noticeShortfallDays?: number;
  noticeRentCoveredDays?: number;
  noticeChargeableDays?: number;
  noticeDeductionPaise?: number;
  deductionPaise?: number;
}): NoticeDeductionDisplayBreakdown | null {
  const missing =
    row.noticeShortfallDays ??
    (row.noticeGivenDate && row.vacatingDate
      ? noticeShortfallDays({
          noticeGivenDate: row.noticeGivenDate,
          vacatingDate: row.vacatingDate,
        })
      : 0);
  const deduction = row.noticeDeductionPaise ?? row.deductionPaise ?? 0;
  if (missing <= 0 && deduction <= 0) return null;

  const rentCoveredDays = row.noticeRentCoveredDays ?? 0;
  return {
    noticeRequiredDays: row.noticeRequiredDays ?? VACATING_NOTICE_MIN_DAYS,
    noticeGivenDays: row.noticeGivenDays ?? 0,
    missingNoticeDays: missing,
    rentCoveredDays,
    chargeableNoticeDays:
      row.noticeChargeableDays ?? Math.max(0, missing - rentCoveredDays),
    noticeDeductionPaise: deduction,
  };
}
