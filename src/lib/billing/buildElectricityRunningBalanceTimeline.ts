/**
 * Chronological running-balance ledger for operator explainability — assembly only.
 */
import type { ElectricityInvoiceHistoryRow } from '@/src/lib/billing/buildRoomElectricityOperatorView';
import type { ElectricityPaymentHistoryRow } from '@/src/services/electricityPaymentHistory';

export type ElectricityRunningBalanceEvent = {
  id: string;
  date: string;
  sortOrder: number;
  kind: 'bill_generated' | 'payment' | 'credit';
  label: string;
  /** Positive increases balance owed; negative reduces it. */
  deltaPaise: number;
  outstandingAfterPaise: number;
  electricityBillId: string | null;
  electricityInvoiceId: string | null;
  billingMonth: string | null;
};

function paymentKind(source: string): ElectricityRunningBalanceEvent['kind'] {
  if (source === 'historical' || source === 'checkout_recovery' || source === 'checkout_settlement') {
    return 'credit';
  }
  return 'payment';
}

function paymentLabel(row: ElectricityPaymentHistoryRow): string {
  switch (row.source) {
    case 'monthly_invoice':
      return row.invoiceNumber
        ? `Payment · ${row.invoiceNumber}`
        : 'Monthly invoice payment';
    case 'historical':
      return 'Advance / historical collection';
    case 'checkout_recovery':
      return 'Checkout deposit recovery';
    case 'checkout_settlement':
      return 'Checkout settlement credit';
    case 'cash':
      return 'Cash collection';
    case 'upi':
      return 'UPI collection';
    case 'manual':
      return 'Manual adjustment';
    default:
      return row.paymentMode;
  }
}

export function buildElectricityRunningBalanceTimeline(input: {
  invoiceHistory: ElectricityInvoiceHistoryRow[];
  paymentHistory: ElectricityPaymentHistoryRow[];
}): ElectricityRunningBalanceEvent[] {
  const raw: Omit<ElectricityRunningBalanceEvent, 'outstandingAfterPaise'>[] = [];

  for (const inv of input.invoiceHistory) {
    if (inv.status === 'cancelled') continue;
    raw.push({
      id: `bill-${inv.id}`,
      date: (inv.createdAt ?? inv.billingMonth).slice(0, 10),
      sortOrder: 0,
      kind: 'bill_generated',
      label: `Bill generated · ${inv.invoiceNumber} (${inv.billingMonth.slice(0, 7)})`,
      deltaPaise: inv.amountPaise,
      electricityBillId: inv.electricityBillId,
      electricityInvoiceId: inv.id,
      billingMonth: inv.billingMonth,
    });
  }

  for (const pay of input.paymentHistory) {
    if (pay.amountPaise <= 0) continue;
    raw.push({
      id: pay.id,
      date: pay.date.slice(0, 10),
      sortOrder: 1,
      kind: paymentKind(pay.source),
      label: paymentLabel(pay),
      deltaPaise: -pay.amountPaise,
      electricityBillId: null,
      electricityInvoiceId: pay.electricityInvoiceId,
      billingMonth: pay.billingMonth,
    });
  }

  raw.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id),
  );

  let running = 0;
  return raw.map((event) => {
    running += event.deltaPaise;
    return {
      ...event,
      outstandingAfterPaise: Math.max(0, running),
    };
  });
}
