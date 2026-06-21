export type InvoiceAudience = 'admin' | 'resident';

/** Canonical href for unified financial invoice detail pages. */
export function invoiceDetailHref(invoiceId: string, audience: InvoiceAudience): string {
  if (audience === 'admin') return `/admin/invoices/${invoiceId}`;
  return `/account/resident/invoices/${invoiceId}`;
}

/** Resolve pre-built admin href map entry for a mirrored source row. */
export function invoiceHrefFromMap(
  map: Record<string, string>,
  sourceTable: string,
  sourceId: string,
): string | undefined {
  return map[`${sourceTable}:${sourceId}`];
}
