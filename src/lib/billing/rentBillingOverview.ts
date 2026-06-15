import type { RentBillingOverviewRow } from '@/src/services/rentInvoices';

/** Overview queue: not yet billed, or deposit still due — not generated rent invoices. */
export function isRentBillingOverviewActionable(row: RentBillingOverviewRow): boolean {
  if (row.depositDuePaise > 0) return true;
  return row.invoiceStatus === 'none';
}
