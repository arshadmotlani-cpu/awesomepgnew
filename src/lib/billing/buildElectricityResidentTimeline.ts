/**
 * Pure timeline builder for electricity audit — ordered events from SSOT fields only.
 */
export type ElectricityResidentTimelineEvent = {
  id: string;
  kind:
    | 'check_in'
    | 'bill_generated'
    | 'checkout_credit'
    | 'partial_payment'
    | 'remaining_due'
    | 'final_payment';
  label: string;
  date: string;
  amountPaise: number | null;
  invoiceId?: string | null;
  financialInvoiceId?: string | null;
  ledgerEntryId?: string | null;
};

export type BuildElectricityResidentTimelineInput = {
  bookingId: string;
  checkIn: string;
  billGeneratedAt: string | null;
  invoiceId: string | null;
  financialInvoiceId: string | null;
  creditAppliedPaise: number;
  amountAllocatedPaise: number;
  amountPaidPaise: number;
  currentOutstandingPaise: number;
  paidAt: string | null;
  invoiceStatus: string;
};

export function buildElectricityResidentTimeline(
  input: BuildElectricityResidentTimelineInput,
): ElectricityResidentTimelineEvent[] {
  const events: ElectricityResidentTimelineEvent[] = [];

  events.push({
    id: `${input.bookingId}-check-in`,
    kind: 'check_in',
    label: 'Check-in',
    date: input.checkIn,
    amountPaise: null,
  });

  if (input.billGeneratedAt) {
    events.push({
      id: `${input.bookingId}-bill-generated`,
      kind: 'bill_generated',
      label: 'Electricity bill generated',
      date: input.billGeneratedAt.slice(0, 10),
      amountPaise: input.amountAllocatedPaise > 0 ? input.amountAllocatedPaise : null,
      invoiceId: input.invoiceId,
      financialInvoiceId: input.financialInvoiceId,
    });
  }

  if (input.creditAppliedPaise > 0) {
    events.push({
      id: `${input.bookingId}-checkout-credit`,
      kind: 'checkout_credit',
      label: 'Checkout credit applied to room bill',
      date: input.billGeneratedAt?.slice(0, 10) ?? input.checkIn,
      amountPaise: input.creditAppliedPaise,
    });
  }

  const isFullyPaid =
    input.invoiceStatus === 'paid' ||
    (input.amountAllocatedPaise > 0 && input.currentOutstandingPaise === 0 && input.amountPaidPaise > 0);

  if (input.amountPaidPaise > 0 && !isFullyPaid) {
    events.push({
      id: `${input.bookingId}-partial`,
      kind: 'partial_payment',
      label: 'Partial payment',
      date: input.paidAt?.slice(0, 10) ?? input.billGeneratedAt?.slice(0, 10) ?? input.checkIn,
      amountPaise: input.amountPaidPaise,
      invoiceId: input.invoiceId,
      financialInvoiceId: input.financialInvoiceId,
    });
  }

  if (input.currentOutstandingPaise > 0) {
    events.push({
      id: `${input.bookingId}-remaining`,
      kind: 'remaining_due',
      label: 'Remaining due',
      date: new Date().toISOString().slice(0, 10),
      amountPaise: input.currentOutstandingPaise,
      invoiceId: input.invoiceId,
      financialInvoiceId: input.financialInvoiceId,
    });
  }

  if (isFullyPaid && input.amountPaidPaise > 0) {
    events.push({
      id: `${input.bookingId}-final`,
      kind: 'final_payment',
      label: 'Final payment',
      date: input.paidAt?.slice(0, 10) ?? input.billGeneratedAt?.slice(0, 10) ?? input.checkIn,
      amountPaise: input.amountPaidPaise,
      invoiceId: input.invoiceId,
      financialInvoiceId: input.financialInvoiceId,
    });
  }

  return events;
}
