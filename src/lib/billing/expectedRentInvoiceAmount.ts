/**
 * Expected current-month rent invoice amount — shared by generation consumers and certification.
 * Vacating-aware proration and first-month calendar partial must not diverge.
 */
import {
  resolveVacatingAwareRentCharge,
  type ActiveVacatingForBilling,
  type ExistingRentInvoiceForVacatingAdjust,
} from '@/src/lib/billing/billingCoverageModel';
import type { BillingCoveragePeriod } from '@/src/lib/billing/billingCoverageModel';
import {
  billingPeriodForPolicy,
  calendarMonthBillingPeriod,
  firstMonthRentForCalendarPolicy,
  firstOfMonth,
  type BillingCyclePolicy,
} from '@/src/services/billing';

export type ExpectedRentInvoiceAmountInput = {
  billingMonth: string;
  monthlyRentPaise: number;
  billingCyclePolicy: BillingCyclePolicy;
  billingDay: number;
  moveInDate: string;
  paidInvoiceCoverage: BillingCoveragePeriod[];
  activeVacating: ActiveVacatingForBilling | null;
  existingInvoice?: ExistingRentInvoiceForVacatingAdjust | null;
};

/**
 * Authoritative expected rent_paise for the booking's invoice in `billingMonth`.
 * Matches vacating checkout billing + calendar first-month partial rules.
 */
export function resolveExpectedRentInvoiceAmountPaise(
  input: ExpectedRentInvoiceAmountInput,
): {
  amountPaise: number;
  source:
    | 'full_month'
    | 'calendar_first_month_partial'
    | 'vacating_move_out_proration'
    | 'vacating_skip'
    | 'existing_unchanged';
  invoiceNotes: string | null;
} {
  const billingMonth = firstOfMonth(input.billingMonth);
  const period =
    input.billingCyclePolicy === 'calendar_month_1st'
      ? calendarMonthBillingPeriod(billingMonth)
      : billingPeriodForPolicy(input.billingCyclePolicy, {
          dueDate: billingMonth,
          billingDay: input.billingDay,
          billingMonth,
        });

  let fullOrPartial = input.monthlyRentPaise;
  let source:
    | 'full_month'
    | 'calendar_first_month_partial'
    | 'vacating_move_out_proration'
    | 'vacating_skip'
    | 'existing_unchanged' = 'full_month';
  let invoiceNotes: string | null = null;

  if (
    input.billingCyclePolicy === 'calendar_month_1st' &&
    firstOfMonth(input.moveInDate) === billingMonth &&
    input.moveInDate > calendarMonthBillingPeriod(billingMonth).periodStart
  ) {
    const partial = firstMonthRentForCalendarPolicy(input.monthlyRentPaise, input.moveInDate);
    fullOrPartial = partial.amountPaise;
    source = 'calendar_first_month_partial';
  }

  if (!input.activeVacating) {
    return { amountPaise: fullOrPartial, source, invoiceNotes };
  }

  const charge = resolveVacatingAwareRentCharge({
    billingMonth,
    billingDay: input.billingDay,
    billingCyclePolicy: input.billingCyclePolicy,
    moveInDate: input.moveInDate,
    monthlyRentPaise: input.monthlyRentPaise,
    paidInvoiceCoverage: input.paidInvoiceCoverage,
    activeVacating: input.activeVacating,
    fullMonthRentPaise: fullOrPartial,
    billingPeriod: period,
    existingInvoice: input.existingInvoice ?? null,
  });

  if (
    charge.billingAction === 'skip_past_checkout' ||
    charge.billingAction === 'skip_already_paid' ||
    charge.billingAction === 'skip_no_charge'
  ) {
    return {
      amountPaise: 0,
      source: 'vacating_skip',
      invoiceNotes: charge.invoiceNotes,
    };
  }

  if (
    charge.billingAction === 'generate_prorated' ||
    charge.billingAction === 'adjust_existing'
  ) {
    return {
      amountPaise: charge.chargeablePaise,
      source: 'vacating_move_out_proration',
      invoiceNotes: charge.invoiceNotes,
    };
  }

  if (charge.billingAction === 'no_change') {
    // chargeablePaise is the authoritative would-be charge (full month or already-matching proration).
    // Never echo the stored invoice amount — that would make certification tautological.
    const matchesExisting =
      input.existingInvoice != null &&
      input.existingInvoice.rentPaise === charge.chargeablePaise;
    return {
      amountPaise: charge.chargeablePaise,
      source: matchesExisting
        ? 'existing_unchanged'
        : source === 'calendar_first_month_partial'
          ? source
          : 'full_month',
      invoiceNotes: charge.invoiceNotes,
    };
  }

  return {
    amountPaise: charge.chargeablePaise,
    source: source === 'calendar_first_month_partial' ? source : 'full_month',
    invoiceNotes: charge.invoiceNotes ?? invoiceNotes,
  };
}

/** Portal Total Due = amounts still payable now (excludes payment_in_progress / paid / cancelled). */
export function isPortalPayableInvoiceStatus(effectiveStatus: string): boolean {
  return (
    effectiveStatus === 'pending' ||
    effectiveStatus === 'partial' ||
    effectiveStatus === 'overdue'
  );
}

export function sumPortalPayableOutstandingPaise(
  rows: Array<{ outstandingPaise: number; effectiveStatus: string }>,
): number {
  return rows.reduce((sum, row) => {
    if (row.outstandingPaise <= 0) return sum;
    if (!isPortalPayableInvoiceStatus(row.effectiveStatus)) return sum;
    return sum + row.outstandingPaise;
  }, 0);
}
