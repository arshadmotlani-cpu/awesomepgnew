import 'server-only';

import type { CollectionQueueItem } from '@/src/lib/billing/collectionsQueue';

/**
 * Resolve financial invoice ids for collections queue rows (WhatsApp + invoice deep links).
 * Syncs missing unified invoices when source rows exist but financial mirror is absent.
 * Drops queue rows that still have no financial invoice after sync.
 */
export async function attachFinancialInvoiceIdsToCollectionQueue(
  items: CollectionQueueItem[],
): Promise<CollectionQueueItem[]> {
  if (items.length === 0) return [];

  const { resolveFinancialInvoiceIdMap } = await import('@/src/services/adminCashSettlement');
  const financialIdMap = await resolveFinancialInvoiceIdMap(
    items.map((item) => ({ sourceTable: item.sourceTable, sourceId: item.sourceId })),
  );

  const { syncElectricityInvoiceToUnified, syncRentInvoiceToUnified } = await import(
    '@/src/services/unifiedInvoices'
  );

  const enriched: CollectionQueueItem[] = [];
  for (const item of items) {
    let financialInvoiceId =
      financialIdMap.get(`${item.sourceTable}:${item.sourceId}`) ?? null;

    if (!financialInvoiceId) {
      if (item.sourceTable === 'electricity_invoices') {
        financialInvoiceId = await syncElectricityInvoiceToUnified(item.sourceId);
      } else if (item.sourceTable === 'rent_invoices') {
        financialInvoiceId = await syncRentInvoiceToUnified(item.sourceId);
      }
    }

    if (!financialInvoiceId) continue;

    enriched.push({ ...item, financialInvoiceId });
  }
  return enriched;
}
