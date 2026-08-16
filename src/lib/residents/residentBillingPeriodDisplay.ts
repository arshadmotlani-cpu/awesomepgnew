/**
 * Resident-facing rent invoice period labels — SSOT for Payments, pay-rent, history.
 * Uses stored invoice notes / subtype; does not invent billing math.
 */
import { parseBillingPeriodFromInvoiceNotes } from '@/src/lib/billing/billingCoverageModel';
import { formatBillingMonthLabel } from '@/src/lib/billing/formatBillingMonth';
import { calendarMonthBillingPeriod } from '@/src/services/billing';
import { addDays, parseDate } from '@/src/lib/dates';
import { formatDate } from '@/src/lib/format';

export type ResidentRentBillPeriodInput = {
  billingMonth: string;
  notes?: string | null;
  invoiceSubtype?: 'standard' | 'billing_cycle_transition' | null;
};

export type ResidentRentBillPresentation = {
  titleLabel: string;
  listLabel: string;
  periodStart: string;
  periodEndInclusive: string;
  /** Human inclusive range, e.g. "1 September 2026 – 30 September 2026" */
  periodLabel: string;
  billingPeriodLine: string;
  transitionExplanation: string | null;
  isTransition: boolean;
};

export const RESIDENT_BILLING_TRANSITION_EXPLANATION =
  'One-time adjustment to move your billing cycle to the 1st of every month.';

/**
 * Convert half-open period end (e.g. 1st of next month or anniversary boundary)
 * to inclusive last covered day for resident display.
 */
export function inclusivePeriodEndForResidentDisplay(
  periodStart: string,
  periodEnd: string,
): string {
  if (periodEnd <= periodStart) return periodEnd;

  const start = parseDate(periodStart);
  const end = parseDate(periodEnd);
  const endDay = end.getUTCDate();
  const startDay = start.getUTCDate();

  if (endDay === 1 && startDay === 1 && periodEnd > periodStart) {
    return formatDate(addDays(end, -1));
  }

  if (
    endDay === startDay &&
    periodEnd > periodStart &&
    (end.getUTCFullYear() > start.getUTCFullYear() ||
      end.getUTCMonth() > start.getUTCMonth())
  ) {
    return formatDate(addDays(end, -1));
  }

  return periodEnd;
}

export function formatResidentBillingPeriodRange(
  periodStart: string,
  periodEndInclusive: string,
): string {
  return `${formatDate(periodStart)} – ${formatDate(periodEndInclusive)}`;
}

export function resolveRentInvoiceBillingPeriod(input: ResidentRentBillPeriodInput): {
  periodStart: string;
  periodEndInclusive: string;
} {
  const parsed = parseBillingPeriodFromInvoiceNotes(input.notes);
  if (parsed) {
    return {
      periodStart: parsed.periodStart,
      periodEndInclusive: inclusivePeriodEndForResidentDisplay(
        parsed.periodStart,
        parsed.periodEnd,
      ),
    };
  }

  const calendar = calendarMonthBillingPeriod(input.billingMonth);
  return {
    periodStart: calendar.periodStart,
    periodEndInclusive: calendar.periodEnd,
  };
}

export function buildResidentRentBillPresentation(
  input: ResidentRentBillPeriodInput,
): ResidentRentBillPresentation {
  const isTransition = input.invoiceSubtype === 'billing_cycle_transition';
  const { periodStart, periodEndInclusive } = resolveRentInvoiceBillingPeriod(input);
  const periodLabel = formatResidentBillingPeriodRange(periodStart, periodEndInclusive);
  const billingPeriodLine = `Billing period: ${periodLabel}`;
  const titleLabel = isTransition
    ? 'Billing transition'
    : `Rent · ${formatBillingMonthLabel(input.billingMonth)}`;

  return {
    titleLabel,
    listLabel: titleLabel,
    periodStart,
    periodEndInclusive,
    periodLabel,
    billingPeriodLine,
    transitionExplanation: isTransition ? RESIDENT_BILLING_TRANSITION_EXPLANATION : null,
    isTransition,
  };
}
