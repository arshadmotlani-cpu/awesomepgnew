export type InvoiceAudience = 'admin' | 'resident';

/** Canonical href for unified financial invoice detail pages. */
export function invoiceDetailHref(invoiceId: string, audience: InvoiceAudience): string {
  if (audience === 'admin') return `/admin/invoices/${invoiceId}`;
  return `/account/resident/invoices/${invoiceId}`;
}
