/**
 * Financial integrity audit — when a booking truly lacks a required rent invoice.
 * Uses rent-generation eligibility + booking money balances (no resident-specific rules).
 */
import type { MoneyBalanceSlice } from '@/src/lib/billing/bookingMoneyBalances';

export type MissingRentInvoiceDecision =
  | {
      missing: true;
      billingMonth: string;
      detail: string;
      metadata: Record<string, unknown>;
    }
  | {
      missing: false;
      reason: string;
      metadata?: Record<string, unknown>;
    };

export type RentInvoiceAuditRow = {
  status: string;
  isAdhoc: boolean;
  billingMonth: string;
};

/** Fixed-date / fixed_stay — obligation is booking checkout rent, not a recurring calendar row. */
export function decideMissingRentInvoiceForFixedStay(input: {
  billingMonth: string;
  rent: MoneyBalanceSlice;
  invoices: RentInvoiceAuditRow[];
}): MissingRentInvoiceDecision {
  if (input.rent.outstandingPaise <= 0) {
    return {
      missing: false,
      reason: 'fixed_stay_rent_obligation_settled',
      metadata: {
        billingMonth: input.billingMonth,
        rentRequiredPaise: input.rent.requiredPaise,
        rentReceivedPaise: input.rent.receivedPaise,
      },
    };
  }

  const activeInvoice = input.invoices.find(
    (inv) => inv.status !== 'cancelled' && inv.status !== 'expired',
  );
  if (activeInvoice) {
    return {
      missing: false,
      reason: 'fixed_stay_rent_invoice_on_file',
      metadata: {
        billingMonth: input.billingMonth,
        outstandingPaise: input.rent.outstandingPaise,
        invoiceBillingMonth: activeInvoice.billingMonth,
        isAdhoc: activeInvoice.isAdhoc,
      },
    };
  }

  return {
    missing: true,
    billingMonth: input.billingMonth,
    detail: `Fixed-stay rent outstanding ₹${input.rent.outstandingPaise / 100} with no rent invoice on file`,
    metadata: {
      billingMonth: input.billingMonth,
      outstandingPaise: input.rent.outstandingPaise,
      rentRequiredPaise: input.rent.requiredPaise,
      rentReceivedPaise: input.rent.receivedPaise,
    },
  };
}

/** Monthly / open-ended — only flag when anniversary generation would create an invoice. */
export function decideMissingRentInvoiceForRecurringStay(input: {
  billingMonth: string;
  generationEligible: boolean;
  skipCode?: string;
  hasStandardMonthlyInvoice: boolean;
}): MissingRentInvoiceDecision {
  if (!input.generationEligible) {
    return {
      missing: false,
      reason: 'no_rent_invoice_required',
      metadata: {
        billingMonth: input.billingMonth,
        skipCode: input.skipCode ?? 'not_eligible',
      },
    };
  }

  if (input.hasStandardMonthlyInvoice) {
    return {
      missing: false,
      reason: 'standard_monthly_invoice_exists',
      metadata: { billingMonth: input.billingMonth },
    };
  }

  return {
    missing: true,
    billingMonth: input.billingMonth,
    detail: `No rent invoice for billing month ${input.billingMonth}`,
    metadata: { billingMonth: input.billingMonth },
  };
}
