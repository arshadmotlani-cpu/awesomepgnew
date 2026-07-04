/**
 * Billing Cycle Engine — SSOT for resident anniversary billing.
 *
 * Rules:
 * - Every resident stores a permanent billing day on `resident_billing_profiles`.
 * - Bills generate on the same effective day each month (day 30/31 → last day of month).
 * - Never skip a cycle; never duplicate (`rent_invoices` unique per booking + month).
 * - Leap years handled via UTC calendar math in underlying date helpers.
 */

import { addMonths, formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import {
  anniversaryBillingPeriod,
  billingDayFromMoveIn,
  billingMonthForAnniversaryDate,
  daysInMonth,
  dueDateForBillingDay,
  effectiveBillingDayInMonth,
  firstAutoBillingDate,
  firstOfMonth,
  formatAnniversaryBillingPeriodLabel,
  fullMonthlyRentPaise,
  isBillingAnniversaryToday,
  isResidentActiveOnDate,
  monthBounds,
  rentInvoiceBillingPeriodNote,
} from '@/src/services/billing';

export {
  anniversaryBillingPeriod,
  billingDayFromMoveIn,
  billingMonthForAnniversaryDate,
  dueDateForBillingDay,
  effectiveBillingDayInMonth,
  firstAutoBillingDate,
  firstOfMonth,
  formatAnniversaryBillingPeriodLabel,
  fullMonthlyRentPaise,
  isBillingAnniversaryToday,
  isResidentActiveOnDate,
  monthBounds,
  rentInvoiceBillingPeriodNote,
};

/** Stable idempotency key for a booking billing cycle. */
export function billingCycleKey(bookingId: string, billingMonth: string): string {
  return `${bookingId}:${billingMonth}`;
}

/** Effective due date for a resident's billing day in a given month. */
export function billingCycleDueDate(billingMonth: DateLike, billingDay: number): string {
  return formatDate(dueDateForBillingDay(billingMonth, billingDay));
}

/** Whether `runDate` is the anniversary for this billing day (respects first-auto guard). */
export function shouldGenerateBillOnDate(input: {
  runDate: DateLike;
  billingDay: number;
  firstAutoBillingDate: DateLike;
}): boolean {
  return isBillingAnniversaryToday(input.runDate, input.billingDay, input.firstAutoBillingDate);
}

/** Billing month label (YYYY-MM-01) for an anniversary run on `runDate`. */
export function billingCycleMonthForRunDate(runDate: DateLike): string {
  return billingMonthForAnniversaryDate(runDate);
}

/**
 * List expected billing months between first auto date and `throughDate` (inclusive).
 * Used by audits to detect skipped cycles.
 */
export function expectedBillingMonths(input: {
  firstAutoBillingDate: DateLike;
  throughDate: DateLike;
  billingDay: number;
}): string[] {
  const start = parseDate(input.firstAutoBillingDate);
  const end = parseDate(input.throughDate);
  const months: string[] = [];
  let cursor = monthBounds(start).start;
  const endMonth = monthBounds(end).start;

  while (cursor <= endMonth) {
    const effectiveDay = effectiveBillingDayInMonth(cursor, input.billingDay);
    const anniversary = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), effectiveDay),
    );
    if (anniversary >= start && anniversary <= end) {
      months.push(firstOfMonth(cursor));
    }
    cursor = addMonths(cursor, 1);
  }

  return months;
}

/** True when billing day 31 resolves to 28/29 in February (leap-safe). */
export function isEndOfMonthBillingDay(billingDay: number, month: DateLike): boolean {
  return billingDay > daysInMonth(month);
}
