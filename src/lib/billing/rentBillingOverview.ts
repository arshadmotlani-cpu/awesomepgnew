import type { RentBillingOverviewRow } from '@/src/services/rentInvoices';

/** Overview queue: not yet billed, or deposit still due — not generated rent invoices. */
export function isRentBillingOverviewActionable(row: RentBillingOverviewRow): boolean {
  if (row.depositDuePaise > 0) return true;
  return row.invoiceStatus === 'none';
}

export type RentBillingOverviewCounts = {
  candidateCount: number;
  generatedCount: number;
  pendingCount: number;
  needsBillCount: number;
};

/** Derive Billing Center header stats from full overview rows (SSOT for tab=rent|billing). */
export function deriveRentBillingOverviewCounts(
  rows: RentBillingOverviewRow[],
): RentBillingOverviewCounts {
  const actionable = rows.filter(isRentBillingOverviewActionable);
  return {
    candidateCount: rows.length,
    generatedCount: rows.filter((r) => r.invoiceStatus !== 'none').length,
    pendingCount: actionable.filter((r) => r.invoiceStatus === 'none').length,
    needsBillCount: actionable.filter((r) => r.isDueForGeneration).length,
  };
}
