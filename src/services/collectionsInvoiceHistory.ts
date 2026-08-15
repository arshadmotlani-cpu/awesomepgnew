/**
 * Collections invoice history — rent invoices for a booking with lifecycle labels
 * + financial_invoice ids. Money fields come from projectInvoice / RFE only.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, rentInvoices } from '@/src/db/schema';
import {
  invoiceLifecycleLabel,
  type CollectionsLifecycleLabel,
} from '@/src/lib/collections/invoiceLifecycleLabel';
import {
  billingEventTypeLabel,
  listBillingEventsForBooking,
  listBillingEventsForRentInvoice,
  type BillingEventRow,
} from '@/src/services/billingEvents';
import { projectInvoice } from '@/src/services/rentInvoices';

export type CollectionsInvoiceHistoryRow = {
  rentInvoiceId: string;
  financialInvoiceId: string | null;
  invoiceNumber: string;
  billingMonth: string;
  dueDate: string | null;
  status: string;
  effectiveStatus: string;
  lifecycleLabel: CollectionsLifecycleLabel;
  /** Outstanding from projectInvoice — never recomputed here. */
  outstandingPaise: number;
  rentPaise: number;
  paidAt: Date | null;
  createdAt: Date;
};

export type CollectionsInvoiceHistoryEvent = {
  id: string;
  eventType: string;
  eventLabel: string;
  createdAt: Date;
  rentInvoiceId: string | null;
  financialInvoiceId: string | null;
  payload: Record<string, unknown>;
};

function mapEvent(row: BillingEventRow): CollectionsInvoiceHistoryEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    eventLabel: billingEventTypeLabel(row.eventType),
    createdAt: row.createdAt,
    rentInvoiceId: row.rentInvoiceId,
    financialInvoiceId: row.financialInvoiceId,
    payload: row.payload,
  };
}

async function financialIdMapForRentIds(
  rentIds: string[],
): Promise<Map<string, string>> {
  if (rentIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: financialInvoices.id,
      sourceId: financialInvoices.sourceId,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        inArray(financialInvoices.sourceId, rentIds),
      ),
    );
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.sourceId) map.set(r.sourceId, r.id);
  }
  return map;
}

/**
 * List rent invoices for a booking with RFE lifecycle labels + financial ids.
 */
export async function listCollectionsInvoiceHistoryForBooking(
  bookingId: string,
  opts?: { limit?: number },
): Promise<CollectionsInvoiceHistoryRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
  const rows = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, bookingId))
    .orderBy(desc(rentInvoices.billingMonth), desc(rentInvoices.createdAt))
    .limit(limit);

  const finMap = await financialIdMapForRentIds(rows.map((r) => r.id));

  return rows.map((r) => {
    const projected = projectInvoice(r);
    const lifecycleLabel = invoiceLifecycleLabel({
      status: r.status,
      effectiveStatus: projected.effectiveStatus,
      inProofQueue: true,
    });
    return {
      rentInvoiceId: r.id,
      financialInvoiceId: finMap.get(r.id) ?? null,
      invoiceNumber: r.invoiceNumber,
      billingMonth: r.billingMonth,
      dueDate: r.dueDate,
      status: r.status,
      effectiveStatus: projected.effectiveStatus,
      lifecycleLabel,
      outstandingPaise: projected.outstandingPaise,
      rentPaise: r.rentPaise,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
    };
  });
}

/**
 * Lifecycle label + recent billing_events for a single rent invoice
 * (admin invoice detail / collections surfaces).
 */
export async function loadCollectionsInvoiceLifecycleDetail(input: {
  rentInvoiceId: string;
  financialInvoiceId?: string | null;
  eventLimit?: number;
}): Promise<{
  row: CollectionsInvoiceHistoryRow | null;
  events: CollectionsInvoiceHistoryEvent[];
}> {
  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, input.rentInvoiceId))
    .limit(1);

  if (!invoice) {
    return { row: null, events: [] };
  }

  let financialInvoiceId = input.financialInvoiceId ?? null;
  if (!financialInvoiceId) {
    const map = await financialIdMapForRentIds([invoice.id]);
    financialInvoiceId = map.get(invoice.id) ?? null;
  }

  const projected = projectInvoice(invoice);
  const row: CollectionsInvoiceHistoryRow = {
    rentInvoiceId: invoice.id,
    financialInvoiceId,
    invoiceNumber: invoice.invoiceNumber,
    billingMonth: invoice.billingMonth,
    dueDate: invoice.dueDate,
    status: invoice.status,
    effectiveStatus: projected.effectiveStatus,
    lifecycleLabel: invoiceLifecycleLabel({
      status: invoice.status,
      effectiveStatus: projected.effectiveStatus,
      inProofQueue: true,
    }),
    outstandingPaise: projected.outstandingPaise,
    rentPaise: invoice.rentPaise,
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
  };

  const events = (await listBillingEventsForRentInvoice(invoice.id)).map(mapEvent);
  const limit = input.eventLimit ?? 20;
  return { row, events: events.slice(0, limit) };
}

/**
 * Resident-safe invoice history: lifecycle labels only — no admin payload dumps.
 */
export async function listResidentSafeInvoiceHistory(
  bookingId: string,
  opts?: { limit?: number },
): Promise<
  Array<{
    rentInvoiceId: string;
    financialInvoiceId: string | null;
    invoiceNumber: string;
    billingMonth: string;
    dueDate: string | null;
    lifecycleLabel: CollectionsLifecycleLabel;
    outstandingPaise: number;
    paidAt: Date | null;
  }>
> {
  const rows = await listCollectionsInvoiceHistoryForBooking(bookingId, opts);
  return rows.map((r) => ({
    rentInvoiceId: r.rentInvoiceId,
    financialInvoiceId: r.financialInvoiceId,
    invoiceNumber: r.invoiceNumber,
    billingMonth: r.billingMonth,
    dueDate: r.dueDate,
    lifecycleLabel: r.lifecycleLabel,
    outstandingPaise: r.outstandingPaise,
    paidAt: r.paidAt,
  }));
}

export async function listCollectionsBillingEventsForBooking(
  bookingId: string,
  limit = 30,
): Promise<CollectionsInvoiceHistoryEvent[]> {
  const events = await listBillingEventsForBooking(bookingId, limit);
  return events.map(mapEvent);
}
