/**
 * Billing coverage SSOT — separates invoice coverage, notice prepaid, settlement days, tail rent.
 */
import { diffDays, formatDate, parseDate, addDays } from '@/src/lib/dates';
import {
  computeNoticeDeductionBreakdown,
  resolvePaidThroughDate,
  unusedPrepaidRentDaysAfterVacating,
  type NoticeDeductionBreakdown,
  type PaidRentCoveragePeriod,
} from '@/src/lib/vacating/noticeDeductionEngine';
import {
  computeVacatingFinalPeriodRentDecision,
  resolveAnniversaryPeriodContainingDate,
  resolveBillingPeriodContainingDate,
  type VacatingFinalPeriodRentDecision,
} from '@/src/lib/billing/vacatingFinalPeriodRent';
import {
  anniversaryBillingPeriod,
  billingPeriodForPolicy,
  calendarMonthBillingPeriod,
  dailyRateFromMonthly,
  dueDateForBillingDay,
  firstOfMonth,
  firstPartialMonthPeriod,
  formatAnniversaryBillingPeriodLabel,
  type BillingCyclePolicy,
} from '@/src/services/billing';

export type BillingCoveragePeriod = PaidRentCoveragePeriod;

/** Calendar days inclusive between two YYYY-MM-DD dates. */
export function calendarDaysInclusive(periodStart: string, periodEnd: string): number {
  return Math.max(1, diffDays(periodStart, periodEnd) + 1);
}

/** Daily rent from actual billing-period rent ÷ calendar days in that period (28–31). */
export function dailyRateFromBillingPeriod(
  periodRentPaise: number,
  periodStart: string,
  periodEnd: string,
): number {
  if (periodRentPaise <= 0) return 0;
  const days = calendarDaysInclusive(periodStart, periodEnd);
  return Math.floor(periodRentPaise / days);
}

/** Unused prepaid rent after vacating — days after vacate × period daily rate from paid invoice. */
export function computePrepaidRentAfterVacating(args: {
  vacatingDate: string;
  paidUntilDate: string | null;
  period: BillingCoveragePeriod | null;
  fallbackMonthlyRentPaise?: number;
}): { days: number; paise: number; dailyRentPaise: number } {
  const days = unusedPrepaidRentDaysAfterVacating(args.vacatingDate, args.paidUntilDate);
  if (days <= 0) return { days: 0, paise: 0, dailyRentPaise: 0 };

  const period = args.period;
  if (
    period?.paidPrincipalPaise != null &&
    period.paidPrincipalPaise > 0 &&
    period.periodStart &&
    period.periodEnd
  ) {
    const dailyRentPaise = dailyRateFromBillingPeriod(
      period.paidPrincipalPaise,
      period.periodStart,
      period.periodEnd,
    );
    return { days, paise: dailyRentPaise * days, dailyRentPaise };
  }

  const monthlyRentPaise = args.fallbackMonthlyRentPaise ?? 0;
  const dailyRentPaise = dailyRateFromMonthly(monthlyRentPaise);
  return { days, paise: dailyRentPaise * days, dailyRentPaise };
}


export type BillingCoverageModel = {
  bookingId: string;
  moveInDate: string;
  billingDay: number;
  billingCyclePolicy: BillingCyclePolicy;
  /** Paid rent invoices (and checkout fallback), clamped — never starts before move-in. */
  paidInvoiceCoverage: BillingCoveragePeriod[];
  /** Anniversary period containing `asOfDate` (defaults to vacating or today). */
  currentBillingPeriod: {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    label: string;
  } | null;
  vacatingDate: string | null;
  /** Latest paid-through date extending strictly past vacating (notice prepaid). */
  paidUntilDate: string | null;
  periodUsedForPrepaid: BillingCoveragePeriod | null;
  prepaidAfterVacatingDays: number;
  prepaidAfterVacatingPaise: number;
  /** Calendar days of paid invoice coverage intersecting [moveIn, vacating]. */
  daysPaidForSettlement: number;
  daysPaidSettlementPeriod: { periodStart: string; periodEnd: string } | null;
  tailRent: VacatingFinalPeriodRentDecision;
  finalInvoiceSuppression: boolean;
  tailRentPaise: number;
  noticeBreakdown: NoticeDeductionBreakdown | null;
};

export type BuildBillingCoverageInput = {
  bookingId: string;
  moveInDate: string;
  billingDay: number;
  billingCyclePolicy?: BillingCyclePolicy;
  rawPaidPeriods: BillingCoveragePeriod[];
  vacatingDate?: string | null;
  asOfDate?: string | null;
  noticeGivenDate?: string | null;
  monthlyRentPaise?: number;
  /** Total rent received on booking — used for BR-MOVEIN-COVERAGE expansion. */
  rentReceivedPaise?: number;
  /** Audit only — skip BR-MOVEIN-COVERAGE expansion (pre-fix behavior). */
  skipMoveInCoverageExpansion?: boolean;
  treatAsApprovedForTail?: boolean;
  noticeApplies?: boolean;
};

/** Clamp invoice anniversary window so coverage never begins before actual check-in. */
export function clampPaidPeriodToMoveIn(
  period: BillingCoveragePeriod,
  moveInDate: string,
): BillingCoveragePeriod | null {
  const moveIn = formatDate(parseDate(moveInDate));
  const end = formatDate(parseDate(period.periodEnd));
  if (end < moveIn) return null;
  const start = formatDate(parseDate(period.periodStart));
  const clampedStart = start < moveIn ? moveIn : start;
  if (clampedStart > end) return null;
  return {
    ...period,
    periodStart: clampedStart,
    periodEnd: end,
  };
}

export function clampPaidInvoiceCoverage(
  periods: BillingCoveragePeriod[],
  moveInDate: string,
): BillingCoveragePeriod[] {
  const out: BillingCoveragePeriod[] = [];
  for (const p of periods) {
    const clamped = clampPaidPeriodToMoveIn(p, moveInDate);
    if (clamped) out.push(clamped);
  }
  return out.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

/**
 * BR-MOVEIN-COVERAGE — first checkout invoice due on move-in day: expand single-day clamped
 * coverage to the full move-in anniversary period when full monthly rent was collected.
 */
export function expandMoveInCheckoutPeriodCoverage(
  clamped: BillingCoveragePeriod[],
  rawPeriods: BillingCoveragePeriod[],
  args: {
    moveInDate: string;
    billingDay: number;
    monthlyRentPaise: number;
    rentReceivedPaise?: number;
    billingCyclePolicy?: BillingCyclePolicy;
  },
): BillingCoveragePeriod[] {
  const monthlyRentPaise = Math.max(0, args.monthlyRentPaise);
  if (monthlyRentPaise <= 0) return clamped;
  if (args.rentReceivedPaise != null && args.rentReceivedPaise < monthlyRentPaise) {
    return clamped;
  }

  const moveIn = formatDate(parseDate(args.moveInDate));
  const policy = args.billingCyclePolicy ?? 'anniversary';
  const residencyAnchor =
    policy === 'calendar_month_1st'
      ? (() => {
          const partial = firstPartialMonthPeriod(moveIn);
          if (partial.periodStart !== moveIn) return null;
          const due = formatDate(dueDateForBillingDay(firstOfMonth(moveIn), args.billingDay));
          return { ...partial, dueDate: due };
        })()
      : resolveAnniversaryPeriodContainingDate({
          date: formatDate(addDays(moveIn, 1)),
          billingDay: args.billingDay,
          moveInDate: moveIn,
        });
  if (!residencyAnchor || residencyAnchor.periodStart !== moveIn) return clamped;

  const out: BillingCoveragePeriod[] = [];
  for (const p of clamped) {
    if (p.periodStart !== moveIn || p.periodEnd !== moveIn) {
      out.push(p);
      continue;
    }
    const raw = rawPeriods.find((r) => r.sourceId === p.sourceId);
    if (!raw) {
      out.push(p);
      continue;
    }
    const rawEnd = formatDate(parseDate(raw.periodEnd));
    if (rawEnd !== moveIn) {
      out.push(p);
      continue;
    }
    out.push({
      ...p,
      periodStart: moveIn,
      periodEnd: residencyAnchor.periodEnd,
    });
  }
  return out.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

function intersectInclusive(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { periodStart: string; periodEnd: string } | null {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start > end) return null;
  return { periodStart: start, periodEnd: end };
}

/** Union of clamped paid coverage days within stay through vacate (inclusive). */
export function computeDaysPaidForSettlement(args: {
  moveInDate: string;
  vacatingDate: string;
  paidInvoiceCoverage: BillingCoveragePeriod[];
}): { days: number; period: { periodStart: string; periodEnd: string } | null } {
  const moveIn = formatDate(parseDate(args.moveInDate));
  const vacate = formatDate(parseDate(args.vacatingDate));
  if (vacate < moveIn) return { days: 0, period: null };

  let unionStart: string | null = null;
  let unionEnd: string | null = null;

  for (const p of args.paidInvoiceCoverage) {
    const hit = intersectInclusive(p.periodStart, p.periodEnd, moveIn, vacate);
    if (!hit) continue;
    if (!unionStart || hit.periodStart < unionStart) unionStart = hit.periodStart;
    if (!unionEnd || hit.periodEnd > unionEnd) unionEnd = hit.periodEnd;
  }

  if (!unionStart || !unionEnd) return { days: 0, period: null };
  const days = Math.max(1, diffDays(unionStart, unionEnd) + 1);
  return { days, period: { periodStart: unionStart, periodEnd: unionEnd } };
}

export function buildBillingCoverageModel(input: BuildBillingCoverageInput): BillingCoverageModel {
  const moveInDate = formatDate(parseDate(input.moveInDate));
  const billingDay = Math.min(Math.max(1, input.billingDay), 31);
  const billingCyclePolicy = input.billingCyclePolicy ?? 'anniversary';
  const monthlyRentPaise = Math.max(0, input.monthlyRentPaise ?? 0);
  let paidInvoiceCoverage = clampPaidInvoiceCoverage(input.rawPaidPeriods, moveInDate);
  if (!input.skipMoveInCoverageExpansion) {
    paidInvoiceCoverage = expandMoveInCheckoutPeriodCoverage(
      paidInvoiceCoverage,
      input.rawPaidPeriods,
      {
        moveInDate,
        billingDay,
        monthlyRentPaise,
        rentReceivedPaise: input.rentReceivedPaise,
        billingCyclePolicy,
      },
    );
  }

  const vacatingDate = input.vacatingDate
    ? formatDate(parseDate(input.vacatingDate))
    : null;
  const asOf =
    input.asOfDate != null
      ? formatDate(parseDate(input.asOfDate))
      : vacatingDate ?? formatDate(new Date());

  const currentRaw = resolveBillingPeriodContainingDate({
    date: asOf,
    billingDay,
    moveInDate,
    billingCyclePolicy,
  });
  const currentBillingPeriod = currentRaw
    ? {
        periodStart: currentRaw.periodStart,
        periodEnd: currentRaw.periodEnd,
        dueDate: currentRaw.dueDate,
        label: formatAnniversaryBillingPeriodLabel(
          currentRaw.periodStart,
          currentRaw.periodEnd,
        ),
      }
    : null;

  const { paidUntilDate, periodUsed: periodUsedForPrepaid } = vacatingDate
    ? resolvePaidThroughDate(vacatingDate, paidInvoiceCoverage)
    : { paidUntilDate: null as string | null, periodUsed: null as BillingCoveragePeriod | null };

  const prepaidAfterVacatingDays = vacatingDate
    ? unusedPrepaidRentDaysAfterVacating(vacatingDate, paidUntilDate)
    : 0;
  const prepaidRent = vacatingDate
    ? computePrepaidRentAfterVacating({
        vacatingDate,
        paidUntilDate,
        period: periodUsedForPrepaid,
        fallbackMonthlyRentPaise: monthlyRentPaise,
      })
    : { days: 0, paise: 0, dailyRentPaise: 0 };
  const prepaidAfterVacatingPaise = prepaidRent.paise;

  const daysPaid = vacatingDate
    ? computeDaysPaidForSettlement({
        moveInDate,
        vacatingDate,
        paidInvoiceCoverage,
      })
    : { days: 0, period: null as { periodStart: string; periodEnd: string } | null };

  const tailRent = vacatingDate
    ? computeVacatingFinalPeriodRentDecision({
        vacatingApproved: input.treatAsApprovedForTail === true,
        vacatingDate,
        billingDay,
        moveInDate,
        monthlyRentPaise,
        paidPeriods: paidInvoiceCoverage,
        billingCyclePolicy,
      })
    : computeVacatingFinalPeriodRentDecision({
        vacatingApproved: false,
        vacatingDate: moveInDate,
        billingDay,
        moveInDate,
        monthlyRentPaise: 0,
        paidPeriods: [],
        billingCyclePolicy,
      });

  let noticeBreakdown: NoticeDeductionBreakdown | null = null;
  if (
    vacatingDate &&
    input.noticeGivenDate &&
    input.noticeApplies !== false &&
    monthlyRentPaise > 0
  ) {
    noticeBreakdown = computeNoticeDeductionBreakdown({
      monthlyRentPaise,
      noticeGivenDate: input.noticeGivenDate,
      vacatingDate,
      paidRentPeriods: paidInvoiceCoverage,
      billingDay,
    });
  }

  return {
    bookingId: input.bookingId,
    moveInDate,
    billingDay,
    billingCyclePolicy,
    paidInvoiceCoverage,
    currentBillingPeriod,
    vacatingDate,
    paidUntilDate,
    periodUsedForPrepaid,
    prepaidAfterVacatingDays,
    prepaidAfterVacatingPaise,
    daysPaidForSettlement: daysPaid.days,
    daysPaidSettlementPeriod: daysPaid.period,
    tailRent,
    finalInvoiceSuppression: tailRent.shouldSuppressFinalInvoice,
    tailRentPaise: tailRent.shouldSuppressFinalInvoice ? tailRent.tailRentPaise : 0,
    noticeBreakdown,
  };
}

/** Re-export for invoice row → raw period before clamp. */
export function rawPeriodFromInvoiceDueDate(
  dueDate: string,
  billingDay: number,
  sourceId: string,
  opts?: {
    billingCyclePolicy?: BillingCyclePolicy;
    billingMonth?: string;
    moveInDate?: string;
  },
): BillingCoveragePeriod {
  const policy = opts?.billingCyclePolicy ?? 'anniversary';
  if (policy === 'calendar_month_1st' && opts?.billingMonth && opts?.moveInDate) {
    const month = firstOfMonth(opts.billingMonth);
    if (firstOfMonth(opts.moveInDate) === month && opts.moveInDate > calendarMonthBillingPeriod(month).periodStart) {
      const partial = firstPartialMonthPeriod(opts.moveInDate);
      return {
        periodStart: partial.periodStart,
        periodEnd: partial.periodEnd,
        source: 'rent_invoice',
        sourceId,
      };
    }
    const cal = calendarMonthBillingPeriod(month);
    return {
      periodStart: cal.periodStart,
      periodEnd: cal.periodEnd,
      source: 'rent_invoice',
      sourceId,
    };
  }
  const billingPeriod = billingPeriodForPolicy(policy, {
    dueDate,
    billingDay,
    billingMonth: opts?.billingMonth,
  });
  return {
    periodStart: billingPeriod.periodStart,
    periodEnd: billingPeriod.periodEnd,
    source: 'rent_invoice',
    sourceId,
  };
}
