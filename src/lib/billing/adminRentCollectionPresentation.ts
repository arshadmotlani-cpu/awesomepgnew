/**
 * Admin collections / Operations rent labels — same canonical period fields as resident portal.
 */
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { buildResidentRentBillPresentation } from '@/src/lib/residents/residentBillingPeriodDisplay';

export type AdminRentCollectionLabelInput = {
  billingMonth: string;
  notes: string | null;
  invoiceSubtype?: 'standard' | 'billing_cycle_transition' | null;
  isAdhoc?: boolean | null;
};

export function adminRentCollectionLabels(input: AdminRentCollectionLabelInput): {
  invoiceLabel: string;
  categoryLabel: string;
  periodLabel: string;
} {
  if (input.invoiceSubtype === 'billing_cycle_transition') {
    const pres = buildResidentRentBillPresentation({
      billingMonth: input.billingMonth,
      notes: input.notes,
      invoiceSubtype: input.invoiceSubtype,
      isAdhoc: false,
    });
    return {
      invoiceLabel: 'Billing cycle transition',
      categoryLabel: 'Billing transition',
      periodLabel: pres.periodLabel,
    };
  }

  const pres = buildResidentRentBillPresentation({
    billingMonth: input.billingMonth,
    notes: input.notes,
    invoiceSubtype: input.invoiceSubtype ?? 'standard',
    isAdhoc: input.isAdhoc ?? false,
  });

  if (input.isAdhoc) {
    return {
      invoiceLabel: `${pres.titleLabel} · ${pres.periodLabel}`,
      categoryLabel: 'Adhoc rent',
      periodLabel: pres.periodLabel,
    };
  }

  const month = billingMonthLabel(input.billingMonth);
  const year = input.billingMonth.length >= 4 ? input.billingMonth.slice(0, 4) : '';
  const periodLabel = year ? `${month} ${year}` : month;

  return {
    invoiceLabel: `Rent · ${input.billingMonth.slice(0, 7)}`,
    categoryLabel: 'Rent',
    periodLabel,
  };
}

/** Rent due queue: exclude only invoices with an active rent payment review (not whole customer). */
export function pendingRentInvoiceIdsFromPaymentReviews(
  paymentProofs: Array<{ kind: string; entityId: string }>,
): Set<string> {
  return new Set(
    paymentProofs.filter((p) => p.kind === 'rent').map((p) => p.entityId).filter(Boolean),
  );
}
