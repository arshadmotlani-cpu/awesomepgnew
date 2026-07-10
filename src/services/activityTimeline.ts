/**
 * Unified activity timeline — merges audit log entries for admin search.
 */
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, customers } from '@/src/db/schema';

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
  const conditions = [];

  if (input.bookingId) {
    conditions.push(eq(auditLog.entityId, input.bookingId));
  }
  if (input.query?.trim()) {
    const q = `%${input.query.trim()}%`;
    conditions.push(or(ilike(auditLog.action, q), ilike(auditLog.entity, q)));
  }

  const rows = await db
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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  const bookingIds = rows.filter((r) => r.entity === 'booking').map((r) => r.entityId);
  const bookingMeta =
    bookingIds.length > 0
      ? await db
          .select({
            id: bookings.id,
            bookingCode: bookings.bookingCode,
            residentName: customers.fullName,
          })
          .from(bookings)
          .innerJoin(customers, eq(customers.id, bookings.customerId))
          .where(or(...bookingIds.map((id) => eq(bookings.id, id))))
      : [];

  const bookingById = new Map(bookingMeta.map((b) => [b.id, b]));

  return rows.map((row) => {
    const booking = row.entity === 'booking' ? bookingById.get(row.entityId) : undefined;
    return {
      id: row.id,
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
  });
}
