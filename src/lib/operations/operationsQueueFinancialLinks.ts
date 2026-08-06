/**
 * Financial invoice resolution for Operations queue WhatsApp + invoice deep links.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityInvoices, rentInvoices } from '@/src/db/schema';
import type { UnifiedOpsItem, UnifiedOpsOutstandingLine } from '@/src/services/unifiedOperationsQueue';

async function resolveFinancialInvoiceIdForSource(
  sourceTable: 'rent_invoices' | 'electricity_invoices',
  sourceId: string,
): Promise<string | null> {
  const { resolveFinancialInvoiceIdMap } = await import('@/src/services/adminCashSettlement');
  const map = await resolveFinancialInvoiceIdMap([{ sourceTable, sourceId }]);
  let financialInvoiceId = map.get(`${sourceTable}:${sourceId}`) ?? null;
  if (financialInvoiceId) return financialInvoiceId;

  const { syncElectricityInvoiceToUnified, syncRentInvoiceToUnified } = await import(
    '@/src/services/unifiedInvoices'
  );
  if (sourceTable === 'electricity_invoices') {
    return await syncElectricityInvoiceToUnified(sourceId);
  }
  return await syncRentInvoiceToUnified(sourceId);
}

async function findCollectibleElectricityInvoiceId(
  bookingId: string,
  billingMonth: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: electricityInvoices.id })
    .from(electricityInvoices)
    .where(
      and(
        eq(electricityInvoices.bookingId, bookingId),
        eq(electricityInvoices.billingMonth, billingMonth),
        isNull(electricityInvoices.supersededByInvoiceId),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function findCollectibleRentInvoiceId(
  bookingId: string,
  billingMonth: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.billingMonth, billingMonth),
        sql`${rentInvoices.status}::text NOT IN ('paid', 'cancelled')`,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function resolveFinancialInvoiceIdForOutstandingLine(
  line: UnifiedOpsOutstandingLine,
): Promise<string | null> {
  if (line.financialInvoiceId) return line.financialInvoiceId;
  if (!line.bookingId || !line.billingMonth) return null;

  const sourceId =
    line.kind === 'electricity'
      ? await findCollectibleElectricityInvoiceId(line.bookingId, line.billingMonth)
      : line.kind === 'rent'
        ? await findCollectibleRentInvoiceId(line.bookingId, line.billingMonth)
        : null;

  if (!sourceId) return null;

  const sourceTable =
    line.kind === 'electricity' ? 'electricity_invoices' : 'rent_invoices';
  return await resolveFinancialInvoiceIdForSource(sourceTable, sourceId);
}

function opsItemOpenHref(item: UnifiedOpsItem, lines: UnifiedOpsOutstandingLine[]): string {
  const invoiceLine = lines.find((line) => line.financialInvoiceId);
  if (invoiceLine?.financialInvoiceId) {
    return `/admin/invoices/${invoiceLine.financialInvoiceId}`;
  }
  if (item.customerId) {
    return `/admin/residents/${item.customerId}#open-bills`;
  }
  return item.openHref;
}

/** Attach financial invoice ids to rent/electricity outstanding lines (Room OS queue path). */
export async function enrichUnifiedOpsItemsWithFinancialInvoiceIds(
  items: UnifiedOpsItem[],
): Promise<UnifiedOpsItem[]> {
  const enriched: UnifiedOpsItem[] = [];

  for (const item of items) {
    if (!item.outstandingLines?.length) {
      enriched.push(item);
      continue;
    }

    const lines: UnifiedOpsOutstandingLine[] = [];
    for (const line of item.outstandingLines) {
      if (line.kind === 'deposit') {
        lines.push(line);
        continue;
      }
      const financialInvoiceId = await resolveFinancialInvoiceIdForOutstandingLine(line);
      if (!financialInvoiceId) continue;
      lines.push({ ...line, financialInvoiceId });
    }

    if (
      (item.queue === 'electricity_due' || item.queue === 'rent_due') &&
      lines.length === 0
    ) {
      continue;
    }

    enriched.push({
      ...item,
      outstandingLines: lines.length > 0 ? lines : item.outstandingLines,
      openHref: opsItemOpenHref(item, lines.length > 0 ? lines : item.outstandingLines ?? []),
    });
  }

  return enriched;
}
