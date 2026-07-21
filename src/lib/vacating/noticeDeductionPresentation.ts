import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';
import { noticeShortfallDays, VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export type NoticeSettlementDisplay = Pick<
  NoticeDeductionBreakdown,
  | 'noticeRequiredDays'
  | 'noticeGivenDays'
  | 'missingNoticeDays'
  | 'billingDay'
  | 'billingCycleLabel'
  | 'paidUntilDate'
  | 'vacatingDate'
  | 'unusedPrepaidRentDays'
  | 'noticeCoveredByPrepaidRent'
  | 'chargeableNoticeDays'
  | 'noticeDeductionPaise'
>;

/** @deprecated use NoticeSettlementDisplay */
export type NoticeDeductionDisplayBreakdown = NoticeSettlementDisplay & {
  rentCoveredDays: number;
};

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
  noticeBreakdownJson?: Partial<NoticeDeductionBreakdown> | null;
}): NoticeSettlementDisplay | null {
  const stored = row.noticeBreakdownJson;
  if (stored && typeof stored === 'object' && stored.vacatingDate) {
    return {
      noticeRequiredDays: stored.noticeRequiredDays ?? VACATING_NOTICE_MIN_DAYS,
      noticeGivenDays: stored.noticeGivenDays ?? 0,
      missingNoticeDays: stored.missingNoticeDays ?? 0,
      billingDay: stored.billingDay ?? 5,
      billingCycleLabel: stored.billingCycleLabel ?? '—',
      paidUntilDate: stored.paidUntilDate ?? null,
      vacatingDate: stored.vacatingDate,
      unusedPrepaidRentDays: stored.unusedPrepaidRentDays ?? 0,
      noticeCoveredByPrepaidRent:
        stored.noticeCoveredByPrepaidRent ?? stored.rentCoveredDays ?? 0,
      chargeableNoticeDays: stored.chargeableNoticeDays ?? 0,
      noticeDeductionPaise: stored.noticeDeductionPaise ?? row.deductionPaise ?? 0,
    };
  }

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

  const noticeCoveredByPrepaidRent = row.noticeRentCoveredDays ?? 0;
  return {
    noticeRequiredDays: row.noticeRequiredDays ?? VACATING_NOTICE_MIN_DAYS,
    noticeGivenDays: row.noticeGivenDays ?? 0,
    missingNoticeDays: missing,
    billingDay: 5,
    billingCycleLabel: '—',
    paidUntilDate: null,
    vacatingDate: row.vacatingDate ?? '',
    unusedPrepaidRentDays: noticeCoveredByPrepaidRent,
    noticeCoveredByPrepaidRent,
    chargeableNoticeDays:
      row.noticeChargeableDays ?? Math.max(0, missing - noticeCoveredByPrepaidRent),
    noticeDeductionPaise: deduction,
  };
}

export function toNoticeSettlementDisplay(
  breakdown: NoticeDeductionBreakdown,
): NoticeSettlementDisplay {
  return {
    noticeRequiredDays: breakdown.noticeRequiredDays,
    noticeGivenDays: breakdown.noticeGivenDays,
    missingNoticeDays: breakdown.missingNoticeDays,
    billingDay: breakdown.billingDay,
    billingCycleLabel: breakdown.billingCycleLabel,
    paidUntilDate: breakdown.paidUntilDate,
    vacatingDate: breakdown.vacatingDate,
    unusedPrepaidRentDays: breakdown.unusedPrepaidRentDays,
    noticeCoveredByPrepaidRent: breakdown.noticeCoveredByPrepaidRent,
    chargeableNoticeDays: breakdown.chargeableNoticeDays,
    noticeDeductionPaise: breakdown.noticeDeductionPaise,
  };
}
