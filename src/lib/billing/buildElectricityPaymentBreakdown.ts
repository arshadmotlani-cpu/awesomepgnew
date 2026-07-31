/**
 * Payment source breakdown for operator lifetime summary — assembly only.
 */
import type { ElectricityInvoiceHistoryRow } from '@/src/lib/billing/buildRoomElectricityOperatorView';
import type { ElectricityPaymentHistoryRow } from '@/src/services/electricityPaymentHistory';

export type ElectricityPaymentBreakdownLine = {
  key: string;
  label: string;
  amountPaise: number;
};

const SOURCE_LABELS: Record<string, string> = {
  monthly_invoice: 'Monthly invoice payments',
  historical: 'Advance / historical collections',
  checkout_recovery: 'Checkout deposit recovery',
  checkout_settlement: 'Checkout settlement',
  cash: 'Cash collection',
  upi: 'UPI collection',
  manual: 'Manual adjustment',
};

function labelForSource(source: string, paymentMode: string): string {
  return SOURCE_LABELS[source] ?? (paymentMode || source.replace(/_/g, ' '));
}

export function buildElectricityPaymentBreakdown(input: {
  invoiceHistory: ElectricityInvoiceHistoryRow[];
  paymentHistory: ElectricityPaymentHistoryRow[];
}): ElectricityPaymentBreakdownLine[] {
  const buckets = new Map<string, ElectricityPaymentBreakdownLine>();

  const monthlyFromInvoices = input.invoiceHistory.reduce((s, inv) => s + inv.paidPaise, 0);
  if (monthlyFromInvoices > 0) {
    buckets.set('monthly_invoice', {
      key: 'monthly_invoice',
      label: SOURCE_LABELS.monthly_invoice!,
      amountPaise: monthlyFromInvoices,
    });
  }

  for (const row of input.paymentHistory) {
    if (row.source === 'monthly_invoice') continue;
    const key = row.source;
    const prev = buckets.get(key);
    const label = labelForSource(row.source, row.paymentMode);
    buckets.set(key, {
      key,
      label,
      amountPaise: (prev?.amountPaise ?? 0) + row.amountPaise,
    });
  }

  return [...buckets.values()]
    .filter((line) => line.amountPaise > 0)
    .sort((a, b) => b.amountPaise - a.amountPaise);
}

export function totalPaidFromBreakdown(lines: ElectricityPaymentBreakdownLine[]): number {
  return lines.reduce((s, line) => s + line.amountPaise, 0);
}
