/**
 * Billing coverage SSOT — separates invoice coverage, notice prepaid, settlement days, tail rent.
 */
import { diffDays, formatDate, parseDate } from '@/src/lib/dates';
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
  type VacatingFinalPeriodRentDecision,
} from '@/src/lib/billing/vacatingFinalPeriodRent';
import {
  anniversaryBillingPeriod,
  dailyRateFromMonthly,
  formatAnniversaryBillingPeriodLabel,
} from '@/src/services/billing';

export type BillingCoveragePeriod = PaidRentCoveragePeriod;

export type BillingCoverageModel = {
  bookingId: string;
  moveInDate: string;
  billingDay: number;
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
  rawPaidPeriods: BillingCoveragePeriod[];
  vacatingDate?: string | null;
  asOfDate?: string | null;
  noticeGivenDate?: string | null;
  monthlyRentPaise?: number;
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
  const paidInvoiceCoverage = clampPaidInvoiceCoverage(input.rawPaidPeriods, moveInDate);

  const vacatingDate = input.vacatingDate
    ? formatDate(parseDate(input.vacatingDate))
    : null;
  const asOf =
    input.asOfDate != null
      ? formatDate(parseDate(input.asOfDate))
      : vacatingDate ?? formatDate(new Date());

  const currentRaw = resolveAnniversaryPeriodContainingDate({
    date: asOf,
    billingDay,
    moveInDate,
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
  const monthlyRentPaise = Math.max(0, input.monthlyRentPaise ?? 0);
  const dailyRentPaise = monthlyRentPaise > 0 ? dailyRateFromMonthly(monthlyRentPaise) : 0;
  const prepaidAfterVacatingPaise = dailyRentPaise * prepaidAfterVacatingDays;

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
      })
    : computeVacatingFinalPeriodRentDecision({
        vacatingApproved: false,
        vacatingDate: moveInDate,
        billingDay,
        moveInDate,
        monthlyRentPaise: 0,
        paidPeriods: [],
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
): BillingCoveragePeriod {
  const billingPeriod = anniversaryBillingPeriod(dueDate, billingDay);
  return {
    periodStart: billingPeriod.periodStart,
    periodEnd: billingPeriod.periodEnd,
    source: 'rent_invoice',
    sourceId,
  };
}
