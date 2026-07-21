/**
 * Notice deduction with paid-rent coverage — pure SSOT.
 *
 * Charge window: last N days before vacating, where N = missing notice days.
 * Half-open [chargeWindowStart, vacatingDate).
 */

import { addDays, diffDays, formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import {
  VACATING_NOTICE_MIN_DAYS,
  dailyRateFromMonthly,
  noticeShortfallDays,
} from '@/src/services/billing';

export type PaidRentCoveragePeriod = {
  periodStart: string;
  periodEnd: string;
  source?: 'rent_invoice' | 'booking_checkout';
  sourceId?: string;
};

export type NoticeDeductionBreakdown = {
  noticeRequiredDays: number;
  noticeGivenDays: number;
  missingNoticeDays: number;
  rentCoveredDays: number;
  chargeableNoticeDays: number;
  dailyRentPaise: number;
  noticeDeductionPaise: number;
  chargeWindowStart: string;
  chargeWindowEnd: string;
  coveredPeriodsUsed: PaidRentCoveragePeriod[];
};

export function buildNoticeChargeWindow(
  vacatingDate: DateLike,
  missingNoticeDays: number,
): { start: string; end: string } {
  const end = formatDate(parseDate(vacatingDate));
  if (missingNoticeDays <= 0) {
    return { start: end, end };
  }
  const start = formatDate(addDays(end, -missingNoticeDays));
  return { start, end };
}

/** Inclusive on both ends — matches anniversary billing period labels. */
export function dayIsCoveredByPaidRent(
  day: string,
  paidPeriods: PaidRentCoveragePeriod[],
): boolean {
  return paidPeriods.some((p) => day >= p.periodStart && day <= p.periodEnd);
}

export function enumerateChargeWindowDays(start: string, endExclusive: string): string[] {
  if (start >= endExclusive) return [];
  const days: string[] = [];
  let cursor = start;
  while (cursor < endExclusive) {
    days.push(cursor);
    cursor = formatDate(addDays(cursor, 1));
  }
  return days;
}

export function computeNoticeDeductionBreakdown(input: {
  monthlyRentPaise: number;
  noticeGivenDate: DateLike;
  vacatingDate: DateLike;
  paidRentPeriods?: PaidRentCoveragePeriod[];
  minDays?: number;
}): NoticeDeductionBreakdown {
  const minDays = input.minDays ?? VACATING_NOTICE_MIN_DAYS;
  const noticeGivenDays = diffDays(input.noticeGivenDate, input.vacatingDate);
  const missingNoticeDays = noticeShortfallDays({
    noticeGivenDate: input.noticeGivenDate,
    vacatingDate: input.vacatingDate,
    minDays,
  });
  const dailyRentPaise = dailyRateFromMonthly(input.monthlyRentPaise);
  const paidRentPeriods = input.paidRentPeriods ?? [];

  const { start: chargeWindowStart, end: chargeWindowEnd } = buildNoticeChargeWindow(
    input.vacatingDate,
    missingNoticeDays,
  );

  const windowDays = enumerateChargeWindowDays(chargeWindowStart, chargeWindowEnd);
  let rentCoveredDays = 0;
  const coveredPeriodsUsed: PaidRentCoveragePeriod[] = [];

  for (const day of windowDays) {
    const covering = paidRentPeriods.filter((p) => day >= p.periodStart && day <= p.periodEnd);
    if (covering.length > 0) {
      rentCoveredDays += 1;
      for (const p of covering) {
        if (!coveredPeriodsUsed.some((u) => u.sourceId === p.sourceId && u.source === p.source)) {
          coveredPeriodsUsed.push(p);
        }
      }
    }
  }

  const chargeableNoticeDays = Math.max(0, missingNoticeDays - rentCoveredDays);
  const noticeDeductionPaise =
    input.monthlyRentPaise <= 0 ? 0 : dailyRentPaise * chargeableNoticeDays;

  return {
    noticeRequiredDays: minDays,
    noticeGivenDays,
    missingNoticeDays,
    rentCoveredDays,
    chargeableNoticeDays,
    dailyRentPaise,
    noticeDeductionPaise,
    chargeWindowStart,
    chargeWindowEnd,
    coveredPeriodsUsed,
  };
}

export function noticeDeductionLedgerReason(breakdown: NoticeDeductionBreakdown): string {
  if (breakdown.chargeableNoticeDays <= 0) {
    return 'notice compliant or fully covered by paid rent';
  }
  const covered =
    breakdown.rentCoveredDays > 0
      ? ` (${breakdown.rentCoveredDays} covered by paid rent)`
      : '';
  return `notice short — ${breakdown.chargeableNoticeDays} chargeable day(s) rent${covered}`;
}
