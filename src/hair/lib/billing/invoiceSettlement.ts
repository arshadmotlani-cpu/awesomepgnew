import type { FyhInvoiceStatus } from '@/src/hair/db/schema/billing';

export type SettlementPayment = {
  method: string;
  amountPaise: number;
};

export type InvoiceSettlement = {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  grandTotalPaise: number;
  creditUsedPaise: number;
  cashPaise: number;
  upiPaise: number;
  cardPaise: number;
  otherCollectedPaise: number;
  /** Cash, UPI, card, and other tenders. Customer credit is separate. */
  totalCollectedPaise: number;
  duePaise: number;
  /** Stored status, except a bill with money still outstanding is never shown as paid. */
  displayStatus: FyhInvoiceStatus;
};

function sumMethod(payments: SettlementPayment[], method: string): number {
  return payments.reduce(
    (sum, payment) =>
      payment.method === method ? sum + Math.max(0, Math.floor(payment.amountPaise)) : sum,
    0,
  );
}

/**
 * Settlement from the invoice header plus payment rows.
 * Due = grand total − credit used − tender collected.
 */
export function summarizeInvoiceSettlement(input: {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  grandTotalPaise: number;
  status: FyhInvoiceStatus;
  payments: SettlementPayment[];
}): InvoiceSettlement {
  const grandTotalPaise = Math.max(0, Math.floor(input.grandTotalPaise));
  const creditUsedPaise = sumMethod(input.payments, 'wallet');
  const cashPaise = sumMethod(input.payments, 'cash');
  const upiPaise = sumMethod(input.payments, 'upi');
  const cardPaise = sumMethod(input.payments, 'card');
  const otherCollectedPaise = input.payments.reduce((sum, payment) => {
    if (
      payment.method === 'wallet' ||
      payment.method === 'cash' ||
      payment.method === 'upi' ||
      payment.method === 'card'
    ) {
      return sum;
    }
    return sum + Math.max(0, Math.floor(payment.amountPaise));
  }, 0);
  const totalCollectedPaise = cashPaise + upiPaise + cardPaise + otherCollectedPaise;
  const duePaise = Math.max(0, grandTotalPaise - creditUsedPaise - totalCollectedPaise);

  return {
    subtotalPaise: Math.max(0, Math.floor(input.subtotalPaise)),
    discountPaise: Math.max(0, Math.floor(input.discountPaise)),
    taxPaise: Math.max(0, Math.floor(input.taxPaise)),
    grandTotalPaise,
    creditUsedPaise,
    cashPaise,
    upiPaise,
    cardPaise,
    otherCollectedPaise,
    totalCollectedPaise,
    duePaise,
    displayStatus: displayInvoiceStatus({
      status: input.status,
      grandTotalPaise,
      amountPaidPaise: Math.min(grandTotalPaise, creditUsedPaise + totalCollectedPaise),
    }),
  };
}

/** Register and detail share this so a short payment cannot render as Paid. */
export function displayInvoiceStatus(input: {
  status: FyhInvoiceStatus;
  grandTotalPaise: number;
  amountPaidPaise: number;
}): FyhInvoiceStatus {
  if (input.status === 'void' || input.status === 'refunded' || input.status === 'draft') {
    return input.status;
  }
  const grand = Math.max(0, Math.floor(input.grandTotalPaise));
  const paid = Math.max(0, Math.floor(input.amountPaidPaise));
  if (grand === 0 || paid >= grand) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

export function settlementReconciles(settlement: InvoiceSettlement): boolean {
  return (
    settlement.grandTotalPaise ===
    settlement.creditUsedPaise + settlement.totalCollectedPaise + settlement.duePaise
  );
}
