/**
 * Notice settlement — prepaid rent offsets notice shortfall.
 *
 * Business rule:
 * 1. Determine paid rent period (billing cycle) and paid-until date.
 * 2. Unused prepaid days = calendar days after vacating date through paid-until (exclusive vacate).
 * 3. Prepaid days satisfy missing notice first; remainder is deposit deduction.
 */

import { diffDays, formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import { dailyRateFromBillingPeriod } from '@/src/lib/billing/billingCoverageModel';
import {
  VACATING_NOTICE_MIN_DAYS,
  dailyRateFromCalendarMonth,
  dailyRateFromMonthly,
  firstOfMonth,
  formatAnniversaryBillingPeriodLabel,
  noticeShortfallDays,
  type BillingCyclePolicy,
} from '@/src/services/billing';

export type PaidRentCoveragePeriod = {
  periodStart: string;
  periodEnd: string;
  source?: 'rent_invoice' | 'booking_checkout';
  sourceId?: string;
  /** Principal collected on this invoice — used for period-accurate daily rates. */
  paidPrincipalPaise?: number;
};

export type NoticeDeductionBreakdown = {
  noticeRequiredDays: number;
  noticeGivenDays: number;
  missingNoticeDays: number;
  billingDay: number;
  billingCycleLabel: string;
  paidUntilDate: string | null;
  vacatingDate: string;
  unusedPrepaidRentDays: number;
  /** Stored in DB as notice_rent_covered_days — satisfied by unused prepaid rent. */
  noticeCoveredByPrepaidRent: number;
  /** Alias for noticeCoveredByPrepaidRent (legacy field name). */
  rentCoveredDays: number;
  chargeableNoticeDays: number;
  dailyRentPaise: number;
  noticeDeductionPaise: number;
  paidPeriodUsed: PaidRentCoveragePeriod | null;
};

/** Latest paid-through date extending past the vacating date. */
export function resolvePaidThroughDate(
  vacatingDate: DateLike,
  paidPeriods: PaidRentCoveragePeriod[],
): { paidUntilDate: string | null; periodUsed: PaidRentCoveragePeriod | null } {
  const vacate = formatDate(parseDate(vacatingDate));
  let containing: PaidRentCoveragePeriod | null = null;
  let extending: PaidRentCoveragePeriod | null = null;

  for (const period of paidPeriods) {
    const principal = period.paidPrincipalPaise ?? 0;
    if (principal <= 0) continue;
    if (period.periodStart > vacate || period.periodEnd <= vacate) continue;

    if (period.periodStart <= vacate && period.periodEnd > vacate) {
      if (
        !containing ||
        period.periodEnd > containing.periodEnd ||
        (period.periodEnd === containing.periodEnd &&
          period.periodStart < containing.periodStart)
      ) {
        containing = period;
      }
    } else if (period.periodEnd > vacate) {
      if (!extending || period.periodEnd > extending.periodEnd) {
        extending = period;
      }
    }
  }

  const periodUsed = containing ?? extending;

  return {
    paidUntilDate: periodUsed?.periodEnd ?? null,
    periodUsed,
  };
}

/** Whole calendar days after vacating date still covered by prepaid rent. */
export function unusedPrepaidRentDaysAfterVacating(
  vacatingDate: DateLike,
  paidUntilDate: string | null,
): number {
  if (!paidUntilDate) return 0;
  const vacate = formatDate(parseDate(vacatingDate));
  if (paidUntilDate <= vacate) return 0;
  return diffDays(vacate, paidUntilDate);
}

export function computeNoticeDeductionBreakdown(input: {
  monthlyRentPaise: number;
  noticeGivenDate: DateLike;
  vacatingDate: DateLike;
  paidRentPeriods?: PaidRentCoveragePeriod[];
  billingDay?: number;
  minDays?: number;
  billingCyclePolicy?: BillingCyclePolicy;
}): NoticeDeductionBreakdown {
  const minDays = input.minDays ?? VACATING_NOTICE_MIN_DAYS;
  const vacatingDate = formatDate(parseDate(input.vacatingDate));
  const noticeGivenDays = diffDays(input.noticeGivenDate, vacatingDate);
  const missingNoticeDays = noticeShortfallDays({
    noticeGivenDate: input.noticeGivenDate,
    vacatingDate,
    minDays,
  });
  const paidRentPeriods = input.paidRentPeriods ?? [];
  const billingDay = input.billingDay ?? 5;

  const { paidUntilDate, periodUsed } = resolvePaidThroughDate(vacatingDate, paidRentPeriods);
  const dailyRentPaise =
    periodUsed?.paidPrincipalPaise != null &&
    periodUsed.paidPrincipalPaise > 0 &&
    periodUsed.periodStart &&
    periodUsed.periodEnd
      ? dailyRateFromBillingPeriod(
          periodUsed.paidPrincipalPaise,
          periodUsed.periodStart,
          periodUsed.periodEnd,
        )
      : input.billingCyclePolicy === 'calendar_month_1st'
        ? dailyRateFromCalendarMonth(input.monthlyRentPaise, firstOfMonth(vacatingDate))
        : dailyRateFromMonthly(input.monthlyRentPaise);
  const unusedPrepaidRentDays = unusedPrepaidRentDaysAfterVacating(vacatingDate, paidUntilDate);
  const noticeCoveredByPrepaidRent = Math.min(missingNoticeDays, unusedPrepaidRentDays);
  const chargeableNoticeDays = Math.max(0, missingNoticeDays - noticeCoveredByPrepaidRent);
  const noticeDeductionPaise =
    input.monthlyRentPaise <= 0 ? 0 : dailyRentPaise * chargeableNoticeDays;

  const billingCycleLabel = periodUsed
    ? formatAnniversaryBillingPeriodLabel(periodUsed.periodStart, periodUsed.periodEnd)
    : 'No prepaid rent after vacate date';

  return {
    noticeRequiredDays: minDays,
    noticeGivenDays,
    missingNoticeDays,
    billingDay,
    billingCycleLabel,
    paidUntilDate,
    vacatingDate,
    unusedPrepaidRentDays,
    noticeCoveredByPrepaidRent,
    rentCoveredDays: noticeCoveredByPrepaidRent,
    chargeableNoticeDays,
    dailyRentPaise,
    noticeDeductionPaise,
    paidPeriodUsed: periodUsed,
  };
}

export function noticeDeductionLedgerReason(breakdown: NoticeDeductionBreakdown): string {
  if (breakdown.chargeableNoticeDays <= 0) {
    return 'notice compliant or fully covered by unused prepaid rent';
  }
  const covered =
    breakdown.noticeCoveredByPrepaidRent > 0
      ? ` (${breakdown.noticeCoveredByPrepaidRent} satisfied by unused prepaid rent)`
      : '';
  return `notice short — ${breakdown.chargeableNoticeDays} chargeable day(s) rent${covered}`;
}
