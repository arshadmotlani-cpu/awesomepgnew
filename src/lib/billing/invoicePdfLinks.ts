/** Client-safe invoice PDF download URL builders (no server imports). */

export function invoicePdfDownloadHref(ref: string): string {
  return `/api/invoices/${encodeURIComponent(ref)}/pdf`;
}

export function invoicePdfShareDownloadHref(shareToken: string): string {
  return `/api/invoices/share/${encodeURIComponent(shareToken)}/pdf`;
}
