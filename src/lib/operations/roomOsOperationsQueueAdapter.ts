/**
 * Operations Centre — Room OS read API adapter (Wave 2 migration).
 * Maps getWorkQueue + loadLedger/loadBed/loadRoomShared into UnifiedOpsItem shape.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { todayString } from '@/src/lib/dates';
import type { UnifiedOpsItem, UnifiedOpsOutstandingLine } from '@/src/services/unifiedOperationsQueue';
import { enrichUnifiedOpsItemsWithFinancialInvoiceIds } from '@/src/lib/operations/operationsQueueFinancialLinks';
import { getWorkQueue } from '@/src/roomOs/api/v1/decision';
import { loadBed, loadLedger, loadRoomShared } from '@/src/roomOs/api/v1/roomOs';
import type { WorkQueueItem } from '@/src/roomOs/types';
import { firstOfMonth } from '@/src/services/billing';

type BookingOpsDisplay = {
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
};

function overdueReason(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'Awaiting resident payment';
  return `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`;
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

async function loadAllWorkQueueItems(
  pgId: string,
  billingMonth: string,
  asOf: string,
): Promise<WorkQueueItem[]> {
  const items: WorkQueueItem[] = [];
  let cursor: string | undefined;
  do {
    const result = await getWorkQueue({
      pgId,
      billingMonth,
      asOf,
      limit: 500,
      cursor,
    });
    items.push(...result.page.items);
    cursor = result.page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

async function loadBookingOpsDisplayBatch(
  bookingIds: string[],
): Promise<Map<string, BookingOpsDisplay>> {
  if (bookingIds.length === 0) return new Map();

  const rows = await db
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
        inArray(bookings.id, bookingIds),
        eq(bedReservations.kind, 'primary'),
        sql`${bedReservations.status}::text IN ('active', 'vacating')`,
      ),
    );

  const map = new Map<string, BookingOpsDisplay>();
  for (const row of rows) {
    if (!row.pgId || map.has(row.bookingId)) continue;
    map.set(row.bookingId, {
      bookingId: row.bookingId,
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
    });
  }
  return map;
}

async function loadActiveBookingsInRoom(
  roomId: string,
): Promise<Array<{ bedId: string; bookingId: string }>> {
  const rows = await db
    .select({
      bedId: beds.id,
      bookingId: bedReservations.bookingId,
    })
    .from(beds)
    .innerJoin(bedReservations, eq(bedReservations.bedId, beds.id))
    .where(
      and(
        eq(beds.roomId, roomId),
        eq(bedReservations.kind, 'primary'),
        sql`${bedReservations.status}::text IN ('active', 'vacating')`,
        sql`${bedReservations.bookingId} IS NOT NULL`,
      ),
    );
  return rows
    .filter((row): row is { bedId: string; bookingId: string } => Boolean(row.bookingId))
    .map((row) => ({ bedId: row.bedId, bookingId: row.bookingId }));
}

function mapRentItem(
  item: WorkQueueItem,
  display: BookingOpsDisplay,
  outstandingPaise: number,
  billingMonth: string,
): UnifiedOpsItem {
  const isOverdue = item.bucket === 'overdue_rent';
  const daysOverdue = isOverdue ? 1 : 0;
  const outstandingLine: UnifiedOpsOutstandingLine = {
    categoryLabel: 'Rent',
    periodLabel: billingMonthLabel(billingMonth),
    amountPaise: outstandingPaise,
    kind: 'rent',
    billingMonth,
    bookingId: display.bookingId,
  };

  return {
    id: isOverdue ? `rent-overdue-${display.bookingId}` : `rent-due-${display.bookingId}`,
    queue: 'rent_due',
    customerId: display.customerId,
    residentName: display.customerName,
    residentPhone: display.customerPhone,
    pgId: display.pgId,
    pgName: display.pgName,
    roomNumber: display.roomNumber,
    bedCode: display.bedCode,
    reason: overdueReason(daysOverdue),
    openHref: `/admin/residents/${display.customerId}#open-bills`,
    openLabel: 'Open bills',
    category: isOverdue ? 'rent_overdue' : 'rent_due',
    bookingId: display.bookingId,
    amountPaise: outstandingPaise,
    billingMonth,
    outstandingLines: [outstandingLine],
  };
}

function mapElectricityItem(
  display: BookingOpsDisplay,
  outstandingPaise: number,
  billingMonth: string,
): UnifiedOpsItem {
  const outstandingLine: UnifiedOpsOutstandingLine = {
    categoryLabel: 'Electricity',
    periodLabel: billingMonthLabel(billingMonth),
    amountPaise: outstandingPaise,
    kind: 'electricity',
    billingMonth,
    bookingId: display.bookingId,
  };

  return {
    id: `elec-os-${display.bookingId}-${billingMonth.slice(0, 7)}`,
    queue: 'electricity_due',
    customerId: display.customerId,
    residentName: display.customerName,
    residentPhone: display.customerPhone,
    pgId: display.pgId,
    pgName: display.pgName,
    roomNumber: display.roomNumber,
    bedCode: display.bedCode,
    reason: overdueReason(0),
    openHref: `/admin/residents/${display.customerId}#open-bills`,
    openLabel: 'Open bills',
    category: 'electricity_due',
    bookingId: display.bookingId,
    amountPaise: outstandingPaise,
    billingMonth,
    outstandingLines: [outstandingLine],
  };
}

async function mapRentWorkQueueItems(
  items: WorkQueueItem[],
  billingMonth: string,
  asOf: string,
): Promise<UnifiedOpsItem[]> {
  const rentItems = items.filter(
    (item) => item.bucket === 'overdue_rent' || item.bucket === 'rent_today',
  );
  const bookingIds = [
    ...new Set(rentItems.map((item) => item.bookingId).filter(Boolean) as string[]),
  ];
  const [displayByBooking, ...ledgers] = await Promise.all([
    loadBookingOpsDisplayBatch(bookingIds),
    ...bookingIds.map((bookingId) => loadLedger({ bookingId, asOf })),
  ]);
  const ledgerByBooking = new Map(
    bookingIds.map((bookingId, index) => [bookingId, ledgers[index]?.snapshot]),
  );

  const mapped: UnifiedOpsItem[] = [];
  for (const item of rentItems) {
    const bookingId = item.bookingId;
    if (!bookingId) continue;
    const display = displayByBooking.get(bookingId);
    const ledger = ledgerByBooking.get(bookingId);
    if (!display || !ledger || ledger.rent.outstandingPaise <= 0) continue;
    mapped.push(mapRentItem(item, display, ledger.rent.outstandingPaise, billingMonth));
  }
  return mapped;
}

async function mapElectricityWorkQueueItems(
  items: WorkQueueItem[],
  billingMonth: string,
  asOf: string,
): Promise<UnifiedOpsItem[]> {
  const roomItems = items.filter((item) => item.bucket === 'electricity' && item.roomId);
  const mapped: UnifiedOpsItem[] = [];
  const seenBookingIds = new Set<string>();

  for (const item of roomItems) {
    if (!item.roomId) continue;
    const [roomShared, occupants] = await Promise.all([
      loadRoomShared({ roomId: item.roomId, billingMonth, asOf }),
      loadActiveBookingsInRoom(item.roomId),
    ]);
    if (roomShared.snapshot?.electricityStatus === 'complete') continue;

    for (const occupant of occupants) {
      if (seenBookingIds.has(occupant.bookingId)) continue;
      const [ledger, bed] = await Promise.all([
        loadLedger({ bookingId: occupant.bookingId, asOf }),
        loadBed({ bedId: occupant.bedId, asOf }),
      ]);
      if (!ledger.snapshot || ledger.snapshot.electricity.outstandingPaise <= 0) continue;
      if (!bed.snapshot?.bookingContext) continue;

      const displayBatch = await loadBookingOpsDisplayBatch([occupant.bookingId]);
      const display = displayBatch.get(occupant.bookingId);
      if (!display) continue;

      seenBookingIds.add(occupant.bookingId);
      mapped.push(
        mapElectricityItem(display, ledger.snapshot.electricity.outstandingPaise, billingMonth),
      );
    }
  }

  return mapped;
}

/** Load rent + electricity queue rows from Room OS APIs for all accessible PGs. */
export async function loadRoomOsOperationsQueueItems(
  session: AdminSession,
): Promise<UnifiedOpsItem[]> {
  const asOf = todayString();
  const billingMonth = firstOfMonth(asOf);
  const accessiblePgs = await listAccessiblePgIds(session);
  const scopedPgs = accessiblePgs.filter((pg) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pg.id),
  );

  const workQueueByPg = await Promise.all(
    scopedPgs.map(async (pg) => loadAllWorkQueueItems(pg.id, billingMonth, asOf)),
  );

  const allWorkItems = workQueueByPg.flat();
  const [rentItems, electricityItems] = await Promise.all([
    mapRentWorkQueueItems(allWorkItems, billingMonth, asOf),
    mapElectricityWorkQueueItems(allWorkItems, billingMonth, asOf),
  ]);

  return await enrichUnifiedOpsItemsWithFinancialInvoiceIds([...rentItems, ...electricityItems]);
}
