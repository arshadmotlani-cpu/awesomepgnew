import {
  batchLookupFinancialInvoiceIds,
  type FinancialInvoiceSourceRef,
} from '@/src/lib/billing/invoiceNumbering';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';

/** Build admin href map for rent/electricity source rows. */
export async function buildAdminInvoiceHrefMap(
  refs: FinancialInvoiceSourceRef[],
): Promise<Record<string, string>> {
  const ids = await batchLookupFinancialInvoiceIds(refs);
  const hrefs: Record<string, string> = {};
  for (const [key, id] of Object.entries(ids)) {
    hrefs[key] = invoiceDetailHref(id, 'admin');
  }
  return hrefs;
}

export function invoiceHrefFromMap(
  map: Record<string, string>,
  sourceTable: string,
  sourceId: string,
): string | undefined {
  return map[`${sourceTable}:${sourceId}`];
}
