/**
 * Approved move-out — final anniversary period rent (suppress invoice + tail in settlement).
 */
import { addDays, addMonths, diffDays, formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import type { PaidRentCoveragePeriod } from '@/src/lib/vacating/noticeDeductionEngine';
import {
  anniversaryBillingPeriod,
  dailyRateFromMonthly,
  dueDateForBillingDay,
  firstOfMonth,
  rentDueDateForMonth,
} from '@/src/services/billing';

export const VACATING_FINAL_PERIOD_CANCEL_REASON_SUFFIX = 'final period in settlement';

export type VacatingFinalPeriodRentDecision = {
  shouldSuppressFinalInvoice: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  tailPeriodStart: string | null;
  tailPeriodEnd: string | null;
  tailDays: number;
  tailRentPaise: number;
  invoiceBillingMonth: string | null;
  cancellationReason: string | null;
  periodDueDate: string | null;
};

function periodsMatch(a: { periodStart: string; periodEnd: string }, b: PaidRentCoveragePeriod): boolean {
  return a.periodStart === b.periodStart && a.periodEnd === b.periodEnd;
}

function isAnniversaryPeriodPaid(
  period: { periodStart: string; periodEnd: string },
  paidPeriods: PaidRentCoveragePeriod[],
): boolean {
  return paidPeriods.some((p) => periodsMatch(period, p));
}

/** Walk anniversary cycles from move-in until `date` lies in [periodStart, periodEnd]. */
export function resolveAnniversaryPeriodContainingDate(args: {
  date: DateLike;
  billingDay: number;
  moveInDate: DateLike;
}): { periodStart: string; periodEnd: string; dueDate: string } | null {
  const target = formatDate(parseDate(args.date));
  const moveIn = formatDate(parseDate(args.moveInDate));
  const billingDay = Math.min(Math.max(1, args.billingDay), 31);

  if (target < moveIn) return null;

  let cursor = parseDate(firstOfMonth(moveIn));
  for (let i = 0; i < 240; i += 1) {
    const billingMonth = firstOfMonth(cursor);
    const dueDate = rentDueDateForMonth({
      billingMonth,
      billingDay,
      moveInDate: moveIn,
    });
    const period = anniversaryBillingPeriod(dueDate, billingDay);
    if (period.periodStart <= target && target <= period.periodEnd) {
      return { ...period, dueDate };
    }
    if (period.periodEnd < target) {
      cursor = addMonths(parseDate(billingMonth), 1);
      continue;
    }
    if (period.periodStart > target) return null;
    cursor = addMonths(parseDate(billingMonth), 1);
  }
  return null;
}

export function computeVacatingFinalPeriodRentDecision(input: {
  vacatingApproved: boolean;
  vacatingDate: DateLike;
  billingDay: number;
  moveInDate: DateLike;
  monthlyRentPaise: number;
  paidPeriods: PaidRentCoveragePeriod[];
}): VacatingFinalPeriodRentDecision {
  const empty: VacatingFinalPeriodRentDecision = {
    shouldSuppressFinalInvoice: false,
    periodStart: null,
    periodEnd: null,
    tailPeriodStart: null,
    tailPeriodEnd: null,
    tailDays: 0,
    tailRentPaise: 0,
    invoiceBillingMonth: null,
    cancellationReason: null,
    periodDueDate: null,
  };

  if (!input.vacatingApproved) return empty;

  const vacatingDate = formatDate(parseDate(input.vacatingDate));
  const period = resolveAnniversaryPeriodContainingDate({
    date: vacatingDate,
    billingDay: input.billingDay,
    moveInDate: input.moveInDate,
  });
  if (!period) return empty;

  if (
    input.paidPeriods.some(
      (p) => p.periodStart <= vacatingDate && vacatingDate <= p.periodEnd,
    )
  ) {
    return empty;
  }

  if (isAnniversaryPeriodPaid(period, input.paidPeriods)) return empty;

  if (vacatingDate >= period.periodEnd) {
    return {
      ...empty,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      periodDueDate: period.dueDate,
      invoiceBillingMonth: firstOfMonth(period.dueDate),
    };
  }

  const lastPaidPeriodEndBeforeVacate = input.paidPeriods.reduce<string | null>((best, p) => {
    if (p.periodEnd >= vacatingDate) return best;
    if (!best || p.periodEnd > best) return p.periodEnd;
    return best;
  }, null);
  const dayAfterPaidUntil = lastPaidPeriodEndBeforeVacate
    ? formatDate(addDays(lastPaidPeriodEndBeforeVacate, 1))
    : null;
  let tailPeriodStart = period.periodStart;
  if (dayAfterPaidUntil && dayAfterPaidUntil > tailPeriodStart) {
    tailPeriodStart = dayAfterPaidUntil;
  }
  const tailPeriodEnd = vacatingDate;
  let tailDays = 0;
  if (tailPeriodStart <= tailPeriodEnd) {
    const daysFromFirstUnpaidToVacate =
      dayAfterPaidUntil != null ? diffDays(dayAfterPaidUntil, vacatingDate) : null;
    // Vacate exactly one calendar day after first unpaid day → single tail day (vacating date only).
    if (daysFromFirstUnpaidToVacate === 1) {
      tailDays = 1;
    } else {
      tailDays = diffDays(tailPeriodStart, tailPeriodEnd) + 1;
    }
  }
  const dailyRentPaise = dailyRateFromMonthly(input.monthlyRentPaise);
  const tailRentPaise = Math.max(0, tailDays * dailyRentPaise);

  const cancellationReason = `Vacating notice — ${VACATING_FINAL_PERIOD_CANCEL_REASON_SUFFIX}`;

  return {
    shouldSuppressFinalInvoice: true,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    tailPeriodStart,
    tailPeriodEnd,
    tailDays,
    tailRentPaise,
    invoiceBillingMonth: firstOfMonth(period.dueDate),
    cancellationReason,
    periodDueDate: period.dueDate,
  };
}

/** Gate anniversary generation for a target billing month. */
export function shouldSuppressAnniversaryInvoiceForVacating(args: {
  decision: VacatingFinalPeriodRentDecision;
  billingMonth: string;
  billingDay: number;
  anniversaryDueDate: string;
}): boolean {
  if (!args.decision.shouldSuppressFinalInvoice || !args.decision.invoiceBillingMonth) {
    return false;
  }
  const month = firstOfMonth(args.billingMonth);
  if (month !== args.decision.invoiceBillingMonth) return false;
  const dueMonth = firstOfMonth(args.anniversaryDueDate);
  return dueMonth === month;
}

export function anniversaryDueDateForBillingMonth(args: {
  billingMonth: DateLike;
  billingDay: number;
  moveInDate: DateLike;
}): string {
  return rentDueDateForMonth({
    billingMonth: args.billingMonth,
    billingDay: args.billingDay,
    moveInDate: args.moveInDate,
  });
}

/** Exported for tests — calendar due on billing month without move-in grace. */
export function calendarDueDateForBillingMonth(billingMonth: DateLike, billingDay: number): string {
  return formatDate(dueDateForBillingDay(billingMonth, billingDay));
}
