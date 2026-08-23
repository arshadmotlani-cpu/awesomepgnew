/**
 * Calendar-month prepaid move-out settlement — simple day-count SSOT.
 *
 * For a fully prepaid calendar month containing the vacating date:
 *   dailyRent = floor(monthlyRent / daysInMonth)
 *   occupiedDays = vacating day-of-month (inclusive through vacate)
 *   unusedDays = daysInMonth − occupiedDays
 *   unusedPrepaid = dailyRent × unusedDays
 *   noticeShortfallDays = max(0, requiredNotice − noticeGiven)
 *   noticeDeduction = dailyRent × noticeShortfallDays (from unused rent, never deposit)
 *   netWalletCredit = unusedPrepaid − noticeDeduction
 *   security deposit stays independent (no "tail rent" from deposit for prepaid days)
 *
 * Bed available = calendar day after vacating at 00:00 PG local.
 */
import { addDays, diffDays, formatDate, parseDate } from '@/src/lib/dates';
import {
  daysInMonth,
  firstOfMonth,
  noticeShortfallDays as computeNoticeShortfallDays,
  VACATING_NOTICE_MIN_DAYS,
} from '@/src/services/billing';
import { bedAvailableCalendarDate } from '@/src/lib/vacating/vacatingBedSemantics';

export type CalendarMonthPrepaidMoveOutSettlement = {
  billingMonth: string;
  daysInMonth: number;
  monthlyRentPaise: number;
  dailyRentPaise: number;
  vacatingDate: string;
  lastOccupiedDate: string;
  bedAvailableFrom: string;
  occupiedDays: number;
  unusedDays: number;
  occupiedRentPaise: number;
  unusedPrepaidRentPaise: number;
  noticeGivenDate: string;
  noticeRequiredDays: number;
  noticeGivenDays: number;
  noticeShortfallDays: number;
  noticeDeductionPaise: number;
  /** Unused prepaid after notice shortfall — wallet "Unused Rent Credit". */
  netUnusedRentWalletCreditPaise: number;
  securityDepositPaise: number;
  electricityDeductionPaise: number;
  electricityPending: boolean;
  /** Deposit + net unused rent − finalized electricity (estimate when pending). */
  estimatedRefundablePaise: number;
};

export function computeCalendarMonthPrepaidMoveOutSettlement(input: {
  monthlyRentPaise: number;
  vacatingDate: string;
  noticeGivenDate: string;
  securityDepositPaise: number;
  requiredNoticeDays?: number;
  electricityDeductionPaise?: number;
  electricityPending?: boolean;
}): CalendarMonthPrepaidMoveOutSettlement {
  const vacatingDate = formatDate(parseDate(input.vacatingDate));
  const noticeGivenDate = formatDate(parseDate(input.noticeGivenDate));
  const billingMonth = firstOfMonth(vacatingDate);
  const monthDays = daysInMonth(billingMonth);
  const vacateDay = parseDate(vacatingDate).getUTCDate();
  const occupiedDays = Math.min(monthDays, Math.max(0, vacateDay));
  const unusedDays = Math.max(0, monthDays - occupiedDays);
  const monthlyRentPaise = Math.max(0, Math.floor(input.monthlyRentPaise));
  const dailyRentPaise = monthDays > 0 ? Math.floor(monthlyRentPaise / monthDays) : 0;

  const noticeRequiredDays = input.requiredNoticeDays ?? VACATING_NOTICE_MIN_DAYS;
  const noticeGivenDays = Math.max(0, diffDays(noticeGivenDate, vacatingDate));
  const shortfallDays = computeNoticeShortfallDays({
    noticeGivenDate,
    vacatingDate,
    minDays: noticeRequiredDays,
  });

  const unusedPrepaidRentPaise = dailyRentPaise * unusedDays;
  const noticeDeductionPaise = dailyRentPaise * shortfallDays;
  const netUnusedRentWalletCreditPaise = Math.max(
    0,
    unusedPrepaidRentPaise - noticeDeductionPaise,
  );

  const securityDepositPaise = Math.max(0, Math.floor(input.securityDepositPaise));
  const electricityDeductionPaise = Math.max(0, Math.floor(input.electricityDeductionPaise ?? 0));
  const electricityPending =
    input.electricityPending ?? electricityDeductionPaise === 0;

  const estimatedRefundablePaise = Math.max(
    0,
    securityDepositPaise + netUnusedRentWalletCreditPaise - electricityDeductionPaise,
  );

  return {
    billingMonth,
    daysInMonth: monthDays,
    monthlyRentPaise,
    dailyRentPaise,
    vacatingDate,
    lastOccupiedDate: vacatingDate,
    bedAvailableFrom: bedAvailableCalendarDate(vacatingDate),
    occupiedDays,
    unusedDays,
    occupiedRentPaise: dailyRentPaise * occupiedDays,
    unusedPrepaidRentPaise,
    noticeGivenDate,
    noticeRequiredDays,
    noticeGivenDays,
    noticeShortfallDays: shortfallDays,
    noticeDeductionPaise,
    netUnusedRentWalletCreditPaise,
    securityDepositPaise,
    electricityDeductionPaise,
    electricityPending,
    estimatedRefundablePaise,
  };
}

/** Inclusive calendar days after vacating through period end (unused prepaid days). */
export function unusedCalendarDaysAfterVacating(
  vacatingDate: string,
  periodEnd: string,
): number {
  const vacate = formatDate(parseDate(vacatingDate));
  const end = formatDate(parseDate(periodEnd));
  if (end <= vacate) return 0;
  return diffDays(vacate, end);
}

/** Occupied days in calendar month through vacating date (1..daysInMonth). */
export function occupiedCalendarDaysThroughVacating(vacatingDate: string): number {
  const d = parseDate(vacatingDate);
  const monthDays = daysInMonth(firstOfMonth(formatDate(d)));
  return Math.min(monthDays, Math.max(0, d.getUTCDate()));
}

/** Day after vacating — first unused prepaid calendar day. */
export function firstUnusedCalendarDayAfterVacating(vacatingDate: string): string {
  return formatDate(addDays(vacatingDate, 1));
}
