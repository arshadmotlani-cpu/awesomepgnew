import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';

const NON_PAYABLE_SHARE_STATUSES = new Set<FinancialInvoiceStatus>([
  'paid',
  'cancelled',
  'payment_in_progress',
  'processing',
  'settled',
  'refunded',
  'expired',
]);

/** Whether the public /i/{token} page should show a Pay CTA for this invoice. */
export function canShowPublicInvoiceSharePayCta(input: {
  status: FinancialInvoiceStatus;
  balanceDuePaise: number;
}): boolean {
  if (input.balanceDuePaise <= 0) return false;
  return !NON_PAYABLE_SHARE_STATUSES.has(input.status);
}
