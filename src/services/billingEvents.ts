/**
 * Append-only billing / collections lifecycle events.
 * Best-effort: never throw to callers — billing must not fail because of the event log.
 * Does not invent money math; payload is opaque audit context only.
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { billingEvents } from '@/src/db/schema';

export const BILLING_EVENT_TYPES = [
  'invoice.upcoming',
  'invoice.generated',
  'invoice.overdue',
  'invoice.paid',
  'invoice.partial',
  'invoice.proof_submitted',
] as const;

export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

export function isBillingEventType(value: string): value is BillingEventType {
  return (BILLING_EVENT_TYPES as readonly string[]).includes(value);
}

/** Human label for admin timeline rows. */
export function billingEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'invoice.upcoming':
      return 'Upcoming';
    case 'invoice.generated':
      return 'Generated';
    case 'invoice.overdue':
      return 'Marked overdue';
    case 'invoice.paid':
      return 'Paid';
    case 'invoice.partial':
      return 'Partial payment';
    case 'invoice.proof_submitted':
      return 'Proof submitted';
    default:
      return eventType;
  }
}

export type RecordBillingEventInput = {
  bookingId: string;
  rentInvoiceId?: string | null;
  financialInvoiceId?: string | null;
  eventType: BillingEventType | string;
  payload?: Record<string, unknown> | null;
};

/**
 * Insert one billing_events row. Returns the new id, or null on failure.
 * Never throws.
 */
export async function recordBillingEvent(
  input: RecordBillingEventInput,
): Promise<string | null> {
  try {
    if (!input.bookingId) return null;
    const [row] = await db
      .insert(billingEvents)
      .values({
        bookingId: input.bookingId,
        rentInvoiceId: input.rentInvoiceId ?? null,
        financialInvoiceId: input.financialInvoiceId ?? null,
        eventType: input.eventType,
        payload: input.payload ?? {},
      })
      .returning({ id: billingEvents.id });
    return row?.id ?? null;
  } catch (err) {
    console.error('[billing_events] recordBillingEvent failed', {
      eventType: input.eventType,
      bookingId: input.bookingId,
      rentInvoiceId: input.rentInvoiceId ?? null,
      err,
    });
    return null;
  }
}

export type BillingEventRow = {
  id: string;
  bookingId: string;
  rentInvoiceId: string | null;
  financialInvoiceId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

function mapRow(row: typeof billingEvents.$inferSelect): BillingEventRow {
  return {
    id: row.id,
    bookingId: row.bookingId,
    rentInvoiceId: row.rentInvoiceId,
    financialInvoiceId: row.financialInvoiceId,
    eventType: row.eventType,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export async function listBillingEventsForBooking(
  bookingId: string,
  limit = 50,
): Promise<BillingEventRow[]> {
  try {
    const rows = await db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.bookingId, bookingId))
      .orderBy(desc(billingEvents.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
    return rows.map(mapRow);
  } catch (err) {
    console.error('[billing_events] listBillingEventsForBooking failed', { bookingId, err });
    return [];
  }
}

export async function listBillingEventsForRentInvoice(
  rentInvoiceId: string,
): Promise<BillingEventRow[]> {
  try {
    const rows = await db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.rentInvoiceId, rentInvoiceId))
      .orderBy(desc(billingEvents.createdAt))
      .limit(100);
    return rows.map(mapRow);
  } catch (err) {
    console.error('[billing_events] listBillingEventsForRentInvoice failed', {
      rentInvoiceId,
      err,
    });
    return [];
  }
}
