/**
 * Billing Centre collections — Room OS adapter (Wave 3).
 * Maps getWorkQueue + loadLedger into CollectionQueueItem shape.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers, bedReservations, beds, floors, pgs, rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import type { CollectionQueueItem, CollectionPriority } from '@/src/lib/billing/collectionsQueue';
import { diffDays, todayString } from '@/src/lib/dates';
import { getWorkQueue } from '@/src/roomOs/api/v1/decision';
import { loadLedger } from '@/src/roomOs/api/v1/roomOs';
import type { WorkQueueItem } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

const PRIORITY_ORDER: Record<CollectionPriority, number> = {
  overdue: 0,
  due_today: 1,
  due_soon: 2,
  pending: 3,
};

function classifyBucketPriority(bucket: WorkQueueItem['bucket'], reasonCode?: string): CollectionPriority {
  if (bucket === 'overdue_rent') return 'overdue';
  if (bucket === 'rent_today') return 'due_today';
  if (reasonCode?.includes('overdue')) return 'overdue';
  return 'pending';
}

async function listAccessiblePgIds(session: AdminSession): Promise<Array<{ id: string; name: string }>> {
  if (session.role === 'super_admin') {
    return db.select({ id: pgs.id, name: pgs.name }).from(pgs);
  }
  if (!session.pgScope?.length) return [];
  return db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(inArray(pgs.id, session.pgScope));
}

async function loadBookingDisplay(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      customerId: customers.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgId: floors.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bedReservations.kind, 'primary'),
        sql`${bedReservations.status}::text IN ('active', 'vacating')`,
      ),
    )
    .limit(1);
  return row ?? null;
}

async function workQueueItemToCollectionItem(
  item: WorkQueueItem,
  billingMonth: string,
  today: string,
): Promise<CollectionQueueItem | null> {
  if (!item.bookingId) return null;
  if (item.bucket !== 'overdue_rent' && item.bucket !== 'rent_today' && item.bucket !== 'electricity') {
    return null;
  }

  const [display, ledgerResult] = await Promise.all([
    loadBookingDisplay(item.bookingId),
    loadLedger({ bookingId: item.bookingId }),
  ]);
  if (!display?.pgId) return null;

  const ledger = ledgerResult.snapshot;
  const isRent = item.bucket === 'overdue_rent' || item.bucket === 'rent_today';
  const outstandingPaise = isRent
    ? ledger?.rent.outstandingPaise ?? 0
    : ledger?.electricity.outstandingPaise ?? 0;
  if (outstandingPaise <= 0) return null;

  const priority = classifyBucketPriority(item.bucket, item.reasonCode);
  const dueDate = today;
  const daysOverdue = item.bucket === 'overdue_rent' ? Math.max(1, diffDays(dueDate, today)) : 0;
  const periodLabel = billingMonthLabel(billingMonth);
  const kind = isRent ? 'rent' : 'electricity';

  return {
    id: `${kind}-room-os-${item.bookingId}`,
    kind,
    customerId: display.customerId,
    customerFullName: display.customerName,
    customerPhone: display.customerPhone ?? '',
    pgId: display.pgId,
    pgName: display.pgName,
    roomNumber: display.roomNumber,
    bedCode: display.bedCode ?? undefined,
    bookingId: item.bookingId,
    sourceTable: isRent ? 'rent_invoices' : 'electricity_invoices',
    sourceId: item.entityId,
    financialInvoiceId: null,
    invoiceNumber: item.id,
    amountPaise: outstandingPaise,
    dueDate,
    daysOverdue,
    priority,
    effectiveStatus: priority === 'overdue' ? 'overdue' : 'pending',
    invoiceLabel: item.title,
    billingMonth,
    categoryLabel: isRent ? 'Rent' : 'Electricity',
    periodLabel,
  };
}

/** Build collections queue from Room OS work queue (Wave 3 billing centre path). */
export async function buildRoomOsCollectionsQueue(
  session: AdminSession,
  billingMonth?: string,
): Promise<CollectionQueueItem[]> {
  const month = billingMonth ?? firstOfMonth(todayString());
  const asOf = todayString();
  const today = asOf;
  const pgsAccessible = await listAccessiblePgIds(session);
  const items: CollectionQueueItem[] = [];

  for (const pg of pgsAccessible) {
    if (!adminCanAccessPg(session, pg.id)) continue;
    const queueItems: WorkQueueItem[] = [];
    let cursor: string | undefined;
    do {
      const result = await getWorkQueue({
        pgId: pg.id,
        billingMonth: month,
        asOf,
        limit: 500,
        cursor,
      });
      queueItems.push(...result.page.items);
      cursor = result.page.nextCursor ?? undefined;
    } while (cursor);
    for (const queueItem of queueItems) {
      const mapped = await workQueueItemToCollectionItem(queueItem, month, today);
      if (mapped) items.push(mapped);
    }
  }

  return items.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return b.amountPaise - a.amountPaise;
  });
}
