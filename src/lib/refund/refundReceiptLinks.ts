export const REFUND_CONSOLE_RETURN_PATH = '/admin/refunds';

export function depositRefundReceiptHref(settlementId: string): string {
  return `/admin/refunds/receipt/${settlementId}?from=refund-console`;
}

export function depositRefundReceiptPrintHref(settlementId: string): string {
  return `/admin/refunds/receipt/${settlementId}/print`;
}
