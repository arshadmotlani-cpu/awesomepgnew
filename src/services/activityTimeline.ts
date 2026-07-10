/**
 * Unified activity timeline — merges audit_log and invoice_audit_events for admin search.
 */
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, customers, financialInvoices, invoiceAuditEvents } from '@/src/db/schema';

export type ActivityTimelineEntry = {
  id: string;
  occurredAt: Date;
  actorType: string;
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  bookingCode: string | null;
  residentName: string | null;
};

export async function searchActivityTimeline(input: {
  query?: string;
  bookingId?: string;
  limit?: number;
}): Promise<ActivityTimelineEntry[]> {
  const limit = Math.min(input.limit ?? 50, 200);
  const auditConditions = [];

  if (input.bookingId) {
    auditConditions.push(eq(auditLog.entityId, input.bookingId));
  }
  if (input.query?.trim()) {
    const q = `%${input.query.trim()}%`;
    auditConditions.push(or(ilike(auditLog.action, q), ilike(auditLog.entity, q)));
  }

  const invoiceConditions = [];
  if (input.query?.trim()) {
    const q = `%${input.query.trim()}%`;
    invoiceConditions.push(ilike(invoiceAuditEvents.action, q));
  }

  const [auditRows, invoiceRows] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        occurredAt: auditLog.createdAt,
        actorType: auditLog.actorType,
        actorId: auditLog.actorId,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        action: auditLog.action,
      })
      .from(auditLog)
      .where(auditConditions.length > 0 ? and(...auditConditions) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit),
    db
      .select({
        id: invoiceAuditEvents.id,
        occurredAt: invoiceAuditEvents.createdAt,
        actorType: invoiceAuditEvents.actorType,
        actorId: invoiceAuditEvents.actorId,
        entityId: invoiceAuditEvents.invoiceId,
        action: invoiceAuditEvents.action,
        invoiceNumber: financialInvoices.invoiceNumber,
        customerName: customers.fullName,
        bookingId: financialInvoices.bookingId,
      })
      .from(invoiceAuditEvents)
      .innerJoin(financialInvoices, eq(financialInvoices.id, invoiceAuditEvents.invoiceId))
      .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
      .where(invoiceConditions.length > 0 ? and(...invoiceConditions) : undefined)
      .orderBy(desc(invoiceAuditEvents.createdAt))
      .limit(limit),
  ]);

  const bookingIds = [
    ...auditRows.filter((r) => r.entity === 'booking').map((r) => r.entityId),
    ...invoiceRows.map((r) => r.bookingId).filter((id): id is string => Boolean(id)),
  ];
  const uniqueBookingIds = [...new Set(bookingIds)];

  const bookingMeta =
    uniqueBookingIds.length > 0
      ? await db
          .select({
            id: bookings.id,
            bookingCode: bookings.bookingCode,
            residentName: customers.fullName,
          })
          .from(bookings)
          .innerJoin(customers, eq(customers.id, bookings.customerId))
          .where(inArray(bookings.id, uniqueBookingIds))
      : [];

  const bookingById = new Map(bookingMeta.map((b) => [b.id, b]));

  const merged: ActivityTimelineEntry[] = [
    ...auditRows.map((row) => {
      const booking = row.entity === 'booking' ? bookingById.get(row.entityId) : undefined;
      return {
        id: `audit:${row.id}`,
        occurredAt: row.occurredAt,
        actorType: row.actorType,
        actorId: row.actorId,
        entity: row.entity,
        entityId: row.entityId,
        action: row.action,
        summary: `${row.entity} · ${row.action}`,
        bookingCode: booking?.bookingCode ?? null,
        residentName: booking?.residentName ?? null,
      };
    }),
    ...invoiceRows.map((row) => {
      const booking = row.bookingId ? bookingById.get(row.bookingId) : undefined;
      return {
        id: `invoice:${row.id}`,
        occurredAt: row.occurredAt,
        actorType: row.actorType,
        actorId: row.actorId,
        entity: 'financial_invoice',
        entityId: row.entityId,
        action: row.action,
        summary: `Invoice ${row.invoiceNumber} · ${row.action}`,
        bookingCode: booking?.bookingCode ?? null,
        residentName: row.customerName ?? booking?.residentName ?? null,
      };
    }),
  ];

  return merged
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, limit);
}
