/**
 * Settlement SSOT — exclude synthetic/test rent invoices from money and coverage calculations.
 */
import { matchesSyntheticRentRow } from '@/src/lib/health/syntheticPollutionCleanup';

export type SettlementRentInvoiceRow = {
  status?: string | null;
  billingMonth: string | Date | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  paymentProofUrl?: string | null;
  isAdhoc?: boolean | null;
  paidPrincipalPaise?: number | null;
};

/** Production rent invoice eligible for settlement rent-paid and billing coverage. */
export function isSettlementRentInvoice(row: SettlementRentInvoiceRow): boolean {
  if (row.status === 'cancelled') return false;
  if (matchesSyntheticRentRow(row)) return false;
  return true;
}

export function sumSettlementRentPaidPaise(
  rows: Array<SettlementRentInvoiceRow & { paidPrincipalPaise: number }>,
): number {
  let total = 0;
  for (const row of rows) {
    if (!isSettlementRentInvoice(row)) continue;
    total += Math.max(0, row.paidPrincipalPaise);
  }
  return total;
}
