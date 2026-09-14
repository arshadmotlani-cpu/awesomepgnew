/**
 * Rent overlap SSOT — adhoc/daily rent and standard monthly rent must not double-charge the same stay days.
 */
import { formatDate, parseDate, addDays } from '@/src/lib/dates';
import {
  calendarDaysInclusive,
  intersectInclusive,
  parseBillingPeriodFromInvoiceNotes,
  rawPeriodFromInvoiceDueDate,
  type BillingCoveragePeriod,
} from '@/src/lib/billing/billingCoverageModel';
import { firstOfMonth, calendarMonthBillingPeriod, type BillingCyclePolicy } from '@/src/services/billing';

export type RentLiabilityInvoiceRow = {
  id: string;
  isAdhoc: boolean;
  invoiceSubtype: 'standard' | 'billing_cycle_transition';
  status: string;
  paidPrincipalPaise: number;
  paidLateFeePaise: number;
  paymentProofUrl?: string | null;
  proofSubmittedAt?: Date | null;
  proofSnapshotOutstandingPaise?: number | null;
  billingMonth: string | Date;
  dueDate: string | null;
  notes: string | null;
};

const OPEN_RENT_STATUSES = new Set(['pending', 'overdue', 'payment_in_progress']);

export function isCollectibleOpenRentInvoice(row: RentLiabilityInvoiceRow): boolean {
  if (row.status === 'paid' || row.status === 'cancelled' || row.status === 'expired') {
    return false;
  }
  return OPEN_RENT_STATUSES.has(row.status);
}

export function isProtectedRentInvoice(row: RentLiabilityInvoiceRow): boolean {
  if (row.status === 'paid') return true;
  if ((row.paidPrincipalPaise ?? 0) > 0 || (row.paidLateFeePaise ?? 0) > 0) return true;
  if (row.status === 'payment_in_progress') return true;
  if (row.paymentProofUrl || row.proofSubmittedAt) return true;
  if ((row.proofSnapshotOutstandingPaise ?? 0) > 0) return true;
  return false;
}

/** Coverage period for overlap / generation skip — includes unpaid adhoc and paid rent alike. */
export function resolveRentLiabilityCoveragePeriod(
  row: RentLiabilityInvoiceRow,
  ctx: {
    billingDay: number;
    billingCyclePolicy: BillingCyclePolicy;
    moveInDate?: string | null;
  },
): BillingCoveragePeriod | null {
  if (row.status === 'cancelled' || row.status === 'expired') return null;

  const billingMonth = firstOfMonth(String(row.billingMonth));
  const notesPeriod = parseBillingPeriodFromInvoiceNotes(row.notes);

  if (row.isAdhoc || row.invoiceSubtype === 'billing_cycle_transition') {
    if (notesPeriod) {
      return {
        periodStart: notesPeriod.periodStart,
        periodEnd: notesPeriod.periodEnd,
        source: 'rent_invoice',
        sourceId: row.id,
      };
    }
    return null;
  }

  if (notesPeriod) {
    return {
      periodStart: notesPeriod.periodStart,
      periodEnd: notesPeriod.periodEnd,
      source: 'rent_invoice',
      sourceId: row.id,
    };
  }

  if (!row.dueDate) return null;

  return rawPeriodFromInvoiceDueDate(String(row.dueDate), ctx.billingDay, row.id, {
    billingCyclePolicy: ctx.billingCyclePolicy,
    billingMonth,
    moveInDate: ctx.moveInDate ?? undefined,
  });
}

function stayWindowInPeriod(
  stayStart: string,
  stayEndInclusive: string,
  periodStart: string,
  periodEnd: string,
): { periodStart: string; periodEnd: string } | null {
  return intersectInclusive(stayStart, stayEndInclusive, periodStart, periodEnd);
}

/**
 * Standard monthly rent is superseded when adhoc (or transition) liability fully covers
 * the resident's stay days inside that invoice's billing period.
 */
export function isStandardMonthlyRentSupersededByAdhocLiability(args: {
  standardInvoice: RentLiabilityInvoiceRow;
  adhocOrTransitionInvoice: RentLiabilityInvoiceRow;
  stayStart: string;
  stayEndInclusive: string;
  billingDay: number;
  billingCyclePolicy: BillingCyclePolicy;
}): boolean {
  if (args.standardInvoice.isAdhoc) return false;
  if (args.standardInvoice.invoiceSubtype === 'billing_cycle_transition') return false;
  if (!args.adhocOrTransitionInvoice.isAdhoc && args.adhocOrTransitionInvoice.invoiceSubtype !== 'billing_cycle_transition') {
    return false;
  }

  const monthlyPeriod = resolveRentLiabilityCoveragePeriod(args.standardInvoice, {
    billingDay: args.billingDay,
    billingCyclePolicy: args.billingCyclePolicy,
    moveInDate: args.stayStart,
  });
  const adhocPeriod = resolveRentLiabilityCoveragePeriod(args.adhocOrTransitionInvoice, {
    billingDay: args.billingDay,
    billingCyclePolicy: args.billingCyclePolicy,
    moveInDate: args.stayStart,
  });
  if (!monthlyPeriod || !adhocPeriod) return false;

  const chargeableStay = stayWindowInPeriod(
    args.stayStart,
    args.stayEndInclusive,
    monthlyPeriod.periodStart,
    monthlyPeriod.periodEnd,
  );
  if (!chargeableStay) return false;

  const adhocCoversStay = stayWindowInPeriod(
    adhocPeriod.periodStart,
    adhocPeriod.periodEnd,
    chargeableStay.periodStart,
    chargeableStay.periodEnd,
  );
  if (!adhocCoversStay) return false;

  return (
    adhocCoversStay.periodStart <= chargeableStay.periodStart &&
    adhocCoversStay.periodEnd >= chargeableStay.periodEnd
  );
}

export function resolveRentOverlapEffectiveStayEndInclusive(args: {
  stay: { start: string; end: string | null };
  billingMonth: string;
  invoices: RentLiabilityInvoiceRow[];
  billingDay: number;
  billingCyclePolicy: BillingCyclePolicy;
  fallbackInclusiveEnd: string;
}): string {
  const reservationEnd = inclusiveStayEndDate(args.stay, args.fallbackInclusiveEnd);
  const cal = calendarMonthBillingPeriod(firstOfMonth(args.billingMonth));
  let end = reservationEnd > cal.periodEnd ? cal.periodEnd : reservationEnd;

  const adhocEnds: string[] = [];
  for (const inv of args.invoices) {
    if (!inv.isAdhoc) continue;
    if (!isCollectibleOpenRentInvoice(inv) && inv.status !== 'paid') continue;
    const period = resolveRentLiabilityCoveragePeriod(inv, {
      billingDay: args.billingDay,
      billingCyclePolicy: args.billingCyclePolicy,
      moveInDate: args.stay.start,
    });
    if (!period) continue;
    if (period.periodEnd < cal.periodEnd && period.periodEnd <= end) {
      adhocEnds.push(period.periodEnd);
    }
  }
  if (adhocEnds.length === 0) return end;
  const latestAdhocEnd = adhocEnds.sort().slice(-1)[0]!;
  return latestAdhocEnd < end ? latestAdhocEnd : end;
}

export function findStandardMonthlyInvoicesSupersededByAdhoc(args: {
  invoices: RentLiabilityInvoiceRow[];
  stay: { start: string; end: string | null };
  billingDay: number;
  billingCyclePolicy: BillingCyclePolicy;
  fallbackInclusiveEnd: string;
}): string[] {
  const adhocLike = args.invoices.filter(
    (i) => i.isAdhoc || i.invoiceSubtype === 'billing_cycle_transition',
  );
  const standard = args.invoices.filter(
    (i) => !i.isAdhoc && i.invoiceSubtype === 'standard',
  );

  const supersededIds = new Set<string>();
  for (const monthly of standard) {
    if (isProtectedRentInvoice(monthly)) continue;
    const billingMonth = firstOfMonth(String(monthly.billingMonth));
    const stayEndForMonth = resolveRentOverlapEffectiveStayEndInclusive({
      stay: args.stay,
      billingMonth,
      invoices: args.invoices,
      billingDay: args.billingDay,
      billingCyclePolicy: args.billingCyclePolicy,
      fallbackInclusiveEnd: args.fallbackInclusiveEnd,
    });
    for (const adhoc of adhocLike) {
      if (
        isStandardMonthlyRentSupersededByAdhocLiability({
          standardInvoice: monthly,
          adhocOrTransitionInvoice: adhoc,
          stayStart: args.stay.start,
          stayEndInclusive: stayEndForMonth,
          billingDay: args.billingDay,
          billingCyclePolicy: args.billingCyclePolicy,
        })
      ) {
        supersededIds.add(monthly.id);
        break;
      }
    }
  }
  return [...supersededIds];
}

/** Pending/open rent liability periods — used to skip auto monthly generation. */
export function buildOpenRentLiabilityCoveragePeriods(
  invoices: RentLiabilityInvoiceRow[],
  ctx: {
    billingDay: number;
    billingCyclePolicy: BillingCyclePolicy;
    moveInDate?: string | null;
  },
): BillingCoveragePeriod[] {
  const out: BillingCoveragePeriod[] = [];
  for (const inv of invoices) {
    if (inv.status === 'cancelled' || inv.status === 'expired') continue;
    const isAdhocLike = inv.isAdhoc || inv.invoiceSubtype === 'billing_cycle_transition';
    if (!isAdhocLike) continue;
    if (!isCollectibleOpenRentInvoice(inv) && inv.status !== 'paid') continue;
    const period = resolveRentLiabilityCoveragePeriod(inv, ctx);
    if (period) out.push(period);
  }
  return out;
}

export function inclusiveStayEndDate(
  stay: { start: string; end: string | null },
  fallbackInclusiveEnd: string,
): string {
  if (!stay.end) return fallbackInclusiveEnd;
  return formatDate(addDays(parseDate(stay.end), -1));
}

export function isBillingMonthCoveredByRentLiability(args: {
  billingMonth: string;
  stayStart: string;
  stayEndInclusive: string;
  liabilityPeriods: BillingCoveragePeriod[];
}): boolean {
  const cal = calendarMonthBillingPeriod(firstOfMonth(args.billingMonth));
  const chargeableStay = stayWindowInPeriod(
    args.stayStart,
    args.stayEndInclusive,
    cal.periodStart,
    cal.periodEnd,
  );
  if (!chargeableStay) return true;

  const requiredDays = calendarDaysInclusive(chargeableStay.periodStart, chargeableStay.periodEnd);
  let coveredDays = 0;

  for (const p of args.liabilityPeriods) {
    const hit = stayWindowInPeriod(
      p.periodStart,
      p.periodEnd,
      chargeableStay.periodStart,
      chargeableStay.periodEnd,
    );
    if (!hit) continue;
    coveredDays = Math.max(
      coveredDays,
      calendarDaysInclusive(hit.periodStart, hit.periodEnd),
    );
  }

  return coveredDays >= requiredDays;
}

export function shouldSkipMonthlyRentBecauseAdhocCoversStay(args: {
  billingMonth: string;
  billingPeriod: { periodStart: string; periodEnd: string };
  invoices: RentLiabilityInvoiceRow[];
  stay: { start: string; end: string | null };
  billingDay: number;
  billingCyclePolicy: BillingCyclePolicy;
}): boolean {
  const fallbackInclusiveEnd = args.billingPeriod.periodEnd;
  const effectiveStayEnd = resolveRentOverlapEffectiveStayEndInclusive({
    stay: args.stay,
    billingMonth: args.billingMonth,
    invoices: args.invoices,
    billingDay: args.billingDay,
    billingCyclePolicy: args.billingCyclePolicy,
    fallbackInclusiveEnd,
  });

  const adhocLike = args.invoices.filter(
    (i) =>
      (i.isAdhoc || i.invoiceSubtype === 'billing_cycle_transition') &&
      (isCollectibleOpenRentInvoice(i) || i.status === 'paid'),
  );
  const standardOpen = args.invoices.filter(
    (i) => !i.isAdhoc && i.invoiceSubtype === 'standard' && isCollectibleOpenRentInvoice(i),
  );

  for (const adhoc of adhocLike) {
    for (const monthly of standardOpen) {
      if (
        isStandardMonthlyRentSupersededByAdhocLiability({
          standardInvoice: monthly,
          adhocOrTransitionInvoice: adhoc,
          stayStart: args.stay.start,
          stayEndInclusive: effectiveStayEnd,
          billingDay: args.billingDay,
          billingCyclePolicy: args.billingCyclePolicy,
        })
      ) {
        return true;
      }
    }
  }

  const liabilityPeriods = buildOpenRentLiabilityCoveragePeriods(args.invoices, {
    billingDay: args.billingDay,
    billingCyclePolicy: args.billingCyclePolicy,
    moveInDate: args.stay.start,
  });

  return isBillingMonthCoveredByRentLiability({
    billingMonth: args.billingMonth,
    stayStart: args.stay.start,
    stayEndInclusive: effectiveStayEnd,
    liabilityPeriods,
  });
}

export const ADHOC_RENT_SUPERSEDES_MONTHLY_CANCEL_REASON =
  'Superseded by adhoc/daily rent invoice covering the same stay period';
