/**
 * Phase 5.5 — pure billing math.
 *
 * Helpers used by `rentInvoices`, `electricityBilling`, and `vacating`
 * services. No I/O lives here on purpose: everything is deterministic
 * given inputs so we can unit-test the entire policy surface (late fee
 * accrual, vacating penalty, electricity split rounding, pro-ration) in
 * isolation, without spinning up Postgres.
 */

import { addDays, addMonths, diffDays, formatDate, parseDate, type DateLike } from '../lib/dates';
import { computeNoticeDeductionBreakdown } from '../lib/vacating/noticeDeductionEngine';

/** Minimum calendar days of notice before vacating for zero deposit deduction. */
export const VACATING_NOTICE_MIN_DAYS = 14;

/** Maximum missing-notice days charged (0-day notice → 14 × daily rent). */
export const VACATING_NOTICE_MAX_DEDUCTION_DAYS = VACATING_NOTICE_MIN_DAYS;

/**
 * @deprecated Fixed 5-day penalty removed 2026-07-21. Use {@link maxNoticeDeduction} for worst-case previews.
 */
export const VACATING_NOTICE_PENALTY_DAYS = 5;

/** Days in the calendar month containing `date`. */
export function daysInMonth(date: DateLike): number {
  const d = parseDate(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/**
 * `[firstOfMonth, firstOfNextMonth)` for the calendar month containing
 * `date`. The pair matches our half-open-range convention so callers can
 * `WHERE billing_month >= start AND billing_month < end` cleanly.
 */
export function monthBounds(date: DateLike): { start: Date; end: Date } {
  const d = parseDate(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = addMonths(start, 1);
  return { start, end };
}

/** YYYY-MM-01 for the month containing `date`. Used for `billing_month` columns. */
export function firstOfMonth(date: DateLike): string {
  return formatDate(monthBounds(date).start);
}

/** Day-of-month (1–31) from a move-in / check-in date — used as rent due day. */
export function billingDayFromMoveIn(moveInDate: DateLike): number {
  const day = parseDate(moveInDate).getUTCDate();
  return Math.min(Math.max(1, day), 31);
}

/** Effective billing day for a calendar month (31st → last day of month). */
export function effectiveBillingDayInMonth(month: DateLike, billingDay: number): number {
  return Math.min(Math.max(1, billingDay), daysInMonth(month));
}

/**
 * First date the nightly job may auto-generate a rent invoice.
 * Check-in in June → earliest auto bill on billing day in July.
 */
export function firstAutoBillingDate(anchorDate: DateLike, billingDay: number): string {
  const { start } = monthBounds(parseDate(anchorDate));
  const nextMonthStart = addMonths(start, 1);
  return formatDate(dueDateForBillingDay(nextMonthStart, billingDay));
}

/** True when `today` is the resident's billing anniversary and past first auto date. */
export function isBillingAnniversaryToday(
  today: DateLike,
  billingDay: number,
  firstAutoDate: DateLike,
): boolean {
  const t = parseDate(today);
  const effective = effectiveBillingDayInMonth(today, billingDay);
  if (t.getUTCDate() !== effective) return false;
  return formatDate(t) >= formatDate(parseDate(firstAutoDate));
}

/** Billing month for an anniversary run on `today` (invoice covers current calendar month). */
export function billingMonthForAnniversaryDate(today: DateLike): string {
  return firstOfMonth(today);
}

/**
 * Full monthly rent for anniversary billing — normal invoices are never prorated.
 */
export function fullMonthlyRentPaise(monthlyRatePaise: number): number {
  return Math.max(0, monthlyRatePaise);
}

/**
 * Billing period ending on the anniversary invoice date.
 * Example: periodEnd 2026-08-04, billingDay 4 → 2026-07-04 → 2026-08-04.
 */
export function anniversaryBillingPeriod(
  periodEnd: DateLike,
  billingDay: number,
): { periodStart: string; periodEnd: string } {
  const end = parseDate(periodEnd);
  const endStr = formatDate(end);
  const { start: monthStart } = monthBounds(end);
  const prevMonthStart = addMonths(monthStart, -1);
  const effectiveDay = effectiveBillingDayInMonth(prevMonthStart, billingDay);
  const periodStart = formatDate(
    new Date(Date.UTC(prevMonthStart.getUTCFullYear(), prevMonthStart.getUTCMonth(), effectiveDay)),
  );
  return { periodStart, periodEnd: endStr };
}

export function formatAnniversaryBillingPeriodLabel(
  periodStart: string,
  periodEnd: string,
): string {
  const fmt = (d: string) => {
    const p = parseDate(d);
    return p.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
  return `${fmt(periodStart)} → ${fmt(periodEnd)}`;
}

/** Invoice notes line for anniversary billing period. */
export function rentInvoiceBillingPeriodNote(periodStart: string, periodEnd: string): string {
  return `Billing period: ${formatAnniversaryBillingPeriodLabel(periodStart, periodEnd)}`;
}

/** Half-open stay [start, end): active on calendar date `date`. */
export function isResidentActiveOnDate(
  stay: { start: string; end: string | null },
  date: DateLike,
): boolean {
  const d = formatDate(parseDate(date));
  if (d < stay.start) return false;
  if (stay.end && d >= stay.end) return false;
  return true;
}

/**
 * Due date for a billing month. Per spec, rent is due on the 1st with a
 * grace period through the 5th; late fees start accruing on the 6th.
 * We store `due_date = billing_month + 4 days` (= the 5th, inclusive)
 * so the "days overdue" computation is just `today - dueDate - 1`.
 */
export function dueDateForMonth(billingMonth: DateLike): Date {
  return dueDateForBillingDay(billingMonth, 5);
}

/**
 * Due date for a billing month using a configured billing day (1–28).
 * Day 5 matches legacy `dueDateForMonth` (1st + 4 days grace).
 */
export function dueDateForBillingDay(billingMonth: DateLike, billingDay: number): Date {
  const { start } = monthBounds(billingMonth);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const maxDay = daysInMonth(start);
  const day = Math.min(Math.max(1, billingDay), maxDay);
  return new Date(Date.UTC(year, month, day));
}

/**
 * Days that the invoice is past the grace period (the 5th). On the 5th
 * itself this is 0 (still within grace). On the 6th this is 1. Anything
 * before the due date returns 0.
 *
 * Prefer {@link daysOverdueFromDueDate} when `invoice.due_date` is available.
 */
export function daysOverdue(billingMonth: DateLike, today: DateLike): number {
  return daysOverdueFromDueDate(dueDateForMonth(billingMonth), today);
}

/** Days past invoice due date (0 on due date, 1 the day after, etc.). */
export function daysOverdueFromDueDate(dueDate: DateLike, today: DateLike): number {
  const days = diffDays(dueDate, today);
  return Math.max(0, days);
}

/**
 * Late fee accrued on the principal as of `today`, in paise.
 *
 * Policy (spec):
 *   - Grace through the 5th. No fee.
 *   - Day 6 onwards: 1% of the ORIGINAL rent per day, accruing linearly
 *     (NOT compounded — example shows ₹6,000 → ₹6,060 → ₹6,120, i.e.
 *     ₹60/day flat = 1% of the original).
 *
 * Rounded with floor() so the customer is never overcharged by
 * sub-paise. `today` defaults to the runtime date.
 */
export function computeLateFee(args: {
  rentPaise: number;
  billingMonth?: DateLike;
  dueDate?: DateLike;
  today?: DateLike;
}): number {
  if (args.rentPaise <= 0) return 0;
  const today = args.today ?? formatDate(new Date());
  const overdue =
    args.dueDate != null
      ? daysOverdueFromDueDate(args.dueDate, today)
      : args.billingMonth != null
        ? daysOverdue(args.billingMonth, today)
        : 0;
  if (overdue === 0) return 0;
  // 1% of original rent per day, floored to whole paise.
  return Math.floor((args.rentPaise * overdue) / 100);
}

/**
 * Electricity due date: 3 days after the bill is issued (spec: "Deadline:
 * 3 days"). `issuedAt` is the bill row's `created_at`.
 *
 * Returned as a plain JS Date so callers can `formatDate()` it for the
 * `due_date` column.
 */
export const ELECTRICITY_GRACE_DAYS = 3;

export function electricityDueDate(
  issuedAt: DateLike,
  graceDays = ELECTRICITY_GRACE_DAYS,
): Date {
  return addDays(issuedAt, graceDays);
}

/**
 * Days past the electricity due date (0 on the due date itself, 1 the
 * day after, etc). Clamped to ≥ 0.
 */
export function electricityDaysOverdue(dueDate: DateLike, today: DateLike): number {
  const days = diffDays(dueDate, today);
  return Math.max(0, days);
}

/**
 * Late fee accrued on an electricity invoice as of `today`. Mirrors the
 * rent-invoice math but keyed off `due_date` (not `billing_month`) since
 * electricity is event-triggered, not calendar-bound.
 *
 *   Day of due_date  → 0
 *   Day after        → 1% of amount
 *   N days after     → floor(amount * N / 100)
 *
 * Returns 0 if amount ≤ 0 or invoice isn't yet overdue.
 */
export function computeElectricityLateFee(args: {
  amountPaise: number;
  dueDate: DateLike;
  today?: DateLike;
}): number {
  if (args.amountPaise <= 0) return 0;
  const today = args.today ?? formatDate(new Date());
  const overdue = electricityDaysOverdue(args.dueDate, today);
  if (overdue === 0) return 0;
  return Math.floor((args.amountPaise * overdue) / 100);
}

/**
 * Daily rate derived from a monthly rate. Spec is explicit: `monthly / 30`,
 * NOT `monthly / daysInMonth`. Used by both the vacating penalty and
 * the pro-ration helper.
 *
 * Floored to whole paise so the deduction can never exceed the
 * customer's expectation.
 */
export function dailyRateFromMonthly(monthlyRatePaise: number): number {
  if (monthlyRatePaise <= 0) return 0;
  return Math.floor(monthlyRatePaise / 30);
}

/** Worst-case notice deduction (0 calendar days of notice). For admin previews only. */
export function maxNoticeDeduction(monthlyRatePaise: number): number {
  return (
    dailyRateFromMonthly(monthlyRatePaise) * VACATING_NOTICE_MAX_DEDUCTION_DAYS
  );
}

/**
 * @deprecated Use {@link maxNoticeDeduction} or {@link computeNoticeDeduction}.
 * Kept for scripts/tests referencing the old fixed 5-day penalty.
 */
export function vacatingPenalty(monthlyRatePaise: number): number {
  return dailyRateFromMonthly(monthlyRatePaise) * VACATING_NOTICE_PENALTY_DAYS;
}

/**
 * Awesome PG notice policy (SSOT):
 * Legacy path without rent coverage — use {@link computeNoticeDeductionBreakdown} via noticeDeduction service for production.
 * deduction = missingNoticeDays × dailyRent when no paid-rent periods supplied.
 */
export function computeNoticeDeduction(
  monthlyRatePaise: number,
  args: {
    noticeGivenDate: DateLike;
    vacatingDate: DateLike;
    minDays?: number;
  },
): number {
  if (monthlyRatePaise <= 0) return 0;
  return computeNoticeDeductionBreakdown({
    monthlyRentPaise: monthlyRatePaise,
    noticeGivenDate: args.noticeGivenDate,
    vacatingDate: args.vacatingDate,
    paidRentPeriods: [],
    minDays: args.minDays,
  }).noticeDeductionPaise;
}

/** Pro-rata notice deduction from a precomputed shortfall day count. */
export function noticeShortfallDeduction(
  monthlyRatePaise: number,
  shortfallDays: number,
): number {
  if (shortfallDays <= 0 || monthlyRatePaise <= 0) return 0;
  return dailyRateFromMonthly(monthlyRatePaise) * shortfallDays;
}

export function noticeShortfallDays(args: {
  noticeGivenDate: DateLike;
  vacatingDate: DateLike;
  minDays?: number;
}): number {
  const min = args.minDays ?? VACATING_NOTICE_MIN_DAYS;
  const given = diffDays(args.noticeGivenDate, args.vacatingDate);
  return Math.max(0, min - given);
}

/**
 * Returns true if at least {@link VACATING_NOTICE_MIN_DAYS} calendar days separate
 * the notice-given date and the desired vacating date.
 */
export function isNoticeCompliant(args: {
  noticeGivenDate: DateLike;
  vacatingDate: DateLike;
  minDays?: number;
}): boolean {
  const min = args.minDays ?? VACATING_NOTICE_MIN_DAYS;
  return diffDays(args.noticeGivenDate, args.vacatingDate) >= min;
}

/**
 * Pro-rate a monthly rent for a partial month.
 *
 * @deprecated Not used for normal monthly rent invoices (anniversary billing uses
 * {@link fullMonthlyRentPaise}). Retained for electricity allocation and legacy audits only.
 *
 *   monthlyRate * (daysActive / daysInMonth)
 *
 * Returns a `{ amountPaise, daysActive, daysInMonth, isFullMonth }`
 * breakdown so callers can show the customer "Rent for 22/30 days
 * = ₹4,400" in the resident dashboard.
 *
 * `activeRange` is `[activeStart, activeEnd)` (half-open). The
 * resulting `daysActive` is clamped to [0, daysInMonth].
 */
export function prorateForMonth(args: {
  monthlyRatePaise: number;
  billingMonth: DateLike;
  activeStart: DateLike;
  /** Exclusive. Pass the next-day after the resident's last day in this month. */
  activeEnd: DateLike;
}): {
  amountPaise: number;
  daysActive: number;
  daysInMonth: number;
  isFullMonth: boolean;
} {
  const { start, end } = monthBounds(args.billingMonth);
  const monthDays = daysInMonth(args.billingMonth);

  // Intersect [activeStart, activeEnd) with [monthStart, monthEnd).
  const aStart = parseDate(args.activeStart);
  const aEnd = parseDate(args.activeEnd);
  const intersectStart = aStart > start ? aStart : start;
  const intersectEnd = aEnd < end ? aEnd : end;

  if (intersectEnd <= intersectStart) {
    return {
      amountPaise: 0,
      daysActive: 0,
      daysInMonth: monthDays,
      isFullMonth: false,
    };
  }

  const daysActive = diffDays(intersectStart, intersectEnd);
  const isFullMonth = daysActive >= monthDays;
  if (isFullMonth) {
    return {
      amountPaise: args.monthlyRatePaise,
      daysActive: monthDays,
      daysInMonth: monthDays,
      isFullMonth: true,
    };
  }
  // Pro-rate; floor so we don't ever over-bill the customer for sub-paise.
  const amountPaise = Math.floor((args.monthlyRatePaise * daysActive) / monthDays);
  return {
    amountPaise,
    daysActive,
    daysInMonth: monthDays,
    isFullMonth: false,
  };
}

/**
 * Equal-split the electricity total across N residents, returning the
 * per-resident amount AND the rounding remainder absorbed by the
 * operator. e.g. ₹1,501 split 3 ways → ₹500/resident, remainder ₹1
 * (operator eats it).
 */
export function splitElectricity(args: {
  totalPaise: number;
  occupantCount: number;
}): {
  perResidentPaise: number;
  remainderPaise: number;
} {
  if (args.occupantCount <= 0) {
    return { perResidentPaise: 0, remainderPaise: args.totalPaise };
  }
  const per = Math.floor(args.totalPaise / args.occupantCount);
  const remainder = args.totalPaise - per * args.occupantCount;
  return { perResidentPaise: per, remainderPaise: remainder };
}

/** Weighted split — remainder absorbed by operator (same policy as equal split). */
export function splitElectricityWeighted(args: {
  totalPaise: number;
  weights: number[];
}): { shares: number[]; remainderPaise: number } {
  const weights = args.weights.map((w) => Math.max(0, w));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0 || args.totalPaise <= 0) {
    return { shares: weights.map(() => 0), remainderPaise: args.totalPaise };
  }
  const shares = weights.map((w) => Math.floor((args.totalPaise * w) / totalWeight));
  const remainder = args.totalPaise - shares.reduce((a, b) => a + b, 0);
  return { shares, remainderPaise: remainder };
}

/**
 * Format a paise amount as a human-readable INR string like `"₹6,000.00"`.
 * Lives here (and not in a shared formatter) because Phase 5.5 UIs
 * intentionally use this for both invoice + ledger rendering and we
 * want one canonical conversion. Other phases can keep their own.
 */
export function formatInr(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const rupeesStr = rupees.toLocaleString('en-IN');
  return `${sign}₹${rupeesStr}.${remainder.toString().padStart(2, '0')}`;
}

/** Rent due date for a billing month — applies move-in grace when check-in is after calendar due. */
export function rentDueDateForMonth(args: {
  billingMonth: DateLike;
  billingDay: number;
  moveInDate: DateLike;
}): string {
  const calendarDue = formatDate(dueDateForBillingDay(args.billingMonth, args.billingDay));
  const moveIn = formatDate(parseDate(args.moveInDate));
  return moveIn > calendarDue ? formatDate(addDays(moveIn, 4)) : calendarDue;
}

/**
 * Next rent due date — prefers earliest open invoice, else projects from billing day + move-in.
 */
export function computeNextRentDueDate(args: {
  moveInDate: string;
  billingDay: number;
  today?: DateLike;
  openInvoiceDueDate?: string | null;
}): string {
  if (args.openInvoiceDueDate) {
    return formatDate(parseDate(args.openInvoiceDueDate));
  }

  const today = formatDate(parseDate(args.today ?? new Date()));
  const billingDay = Math.min(Math.max(1, args.billingDay), 31);
  const moveIn = formatDate(parseDate(args.moveInDate));

  for (let offset = 0; offset < 24; offset += 1) {
    const monthStart = firstOfMonth(addMonths(parseDate(today), offset));
    const due = rentDueDateForMonth({
      billingMonth: monthStart,
      billingDay,
      moveInDate: moveIn,
    });
    if (due >= today) return due;
  }

  const fallbackMonth = firstOfMonth(addMonths(parseDate(today), 1));
  return rentDueDateForMonth({
    billingMonth: fallbackMonth,
    billingDay,
    moveInDate: moveIn,
  });
}

export type RentBillingTimeline = {
  checkInDate: string;
  billingCycleLabel: string;
  rentCycleStart: string;
  currentBillingPeriod: string;
  nextInvoiceDate: string;
  nextDueDate: string;
  billingDay: number;
  monthlyRentPaise: number;
  lastInvoiceDate: string | null;
  lastPaymentDate: string | null;
};

export function buildRentBillingTimeline(args: {
  moveInDate: string;
  billingDay: number;
  monthlyRentPaise: number;
  today?: DateLike;
  openInvoiceDueDate?: string | null;
  openInvoiceBillingMonth?: string | null;
  lastInvoiceDate?: string | null;
  lastPaymentDate?: string | null;
}): RentBillingTimeline {
  const today = formatDate(parseDate(args.today ?? new Date()));
  const billingDay = Math.min(Math.max(1, args.billingDay), 31);
  const nextDueDate = computeNextRentDueDate({
    moveInDate: args.moveInDate,
    billingDay,
    today,
    openInvoiceDueDate: args.openInvoiceDueDate,
  });

  const currentBillingPeriod = (() => {
    if (args.openInvoiceDueDate) {
      const period = anniversaryBillingPeriod(args.openInvoiceDueDate, billingDay);
      return formatAnniversaryBillingPeriodLabel(period.periodStart, period.periodEnd);
    }
    const period = anniversaryBillingPeriod(nextDueDate, billingDay);
    return formatAnniversaryBillingPeriodLabel(period.periodStart, period.periodEnd);
  })();

  return {
    checkInDate: formatDate(parseDate(args.moveInDate)),
    billingCycleLabel: 'Monthly',
    rentCycleStart: formatDate(parseDate(args.moveInDate)),
    currentBillingPeriod,
    nextInvoiceDate: nextDueDate,
    nextDueDate,
    billingDay,
    monthlyRentPaise: args.monthlyRentPaise,
    lastInvoiceDate: args.lastInvoiceDate ?? null,
    lastPaymentDate: args.lastPaymentDate ?? null,
  };
}
