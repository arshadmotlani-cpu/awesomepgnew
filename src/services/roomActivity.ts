import { createHash } from 'node:crypto';
import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  floors,
  pgs,
  roomPageViews,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';

export type RoomActivityStats = {
  bedsTotal: number;
  bedsAvailableNow: number;
  bedsOccupiedNow: number;
  bedsLeavingSoon: number;
  /** Distinct unpaid checkouts (hold) overlapping today — soft interest, not occupancy. */
  interestedBookings: number;
  /** Bookings awaiting payment for beds in this room. */
  pendingPayments: number;
  /** Unique visitors in the last 7 days (null if view tracking is unavailable). */
  uniqueViewers7d: number | null;
};

function visitorKey(customerId: string | null, ip: string | null, userAgent: string | null): string {
  if (customerId) return `c:${customerId}`;
  const raw = `${ip ?? 'unknown'}|${userAgent ?? ''}`;
  return `a:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

/** Record one deduped view per visitor per room per hour. Fails silently if table missing. */
export async function recordRoomPageView(input: {
  roomId: string;
  customerId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const key = visitorKey(input.customerId ?? null, input.ip ?? null, input.userAgent ?? null);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    const [recent] = await db
      .select({ id: roomPageViews.id })
      .from(roomPageViews)
      .where(
        and(
          eq(roomPageViews.roomId, input.roomId),
          eq(roomPageViews.visitorKey, key),
          gte(roomPageViews.viewedAt, oneHourAgo),
        ),
      )
      .limit(1);

    if (recent) return;

    await db.insert(roomPageViews).values({
      roomId: input.roomId,
      visitorKey: key,
    });
  } catch {
    // Table may not exist until migration runs — skip without breaking the page.
  }
}

export async function getRoomActivityStats(
  roomId: string,
  referenceDate?: string,
): Promise<RoomActivityStats> {
  const refDate = referenceDate ?? todayString();

  const bedRows = await db
    .select({
      bedId: beds.id,
      isAvailableNow: sql<boolean>`(
        ${beds.status} = 'available' AND NOT EXISTS (
          SELECT 1 FROM ${bedReservations} br
          WHERE br.bed_id = ${beds.id}
            AND br.status = 'active'
            AND ${refDate}::date <@ br.stay_range
        )
      )`,
    })
    .from(beds)
    .where(and(eq(beds.roomId, roomId), isNull(beds.archivedAt)));

  const bedsTotal = bedRows.length;
  const bedsAvailableNow = bedRows.filter((b) => b.isAvailableNow).length;
  const bedsOccupiedNow = bedsTotal - bedsAvailableNow;

  const [{ interestCount }] = await db
    .select({
      interestCount: sql<number>`count(distinct ${bedReservations.bookingId})::int`,
    })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(beds.roomId, roomId),
        isNull(beds.archivedAt),
        eq(bedReservations.status, 'hold'),
        eq(bookings.status, 'pending_payment'),
        or(
          isNull(bedReservations.holdExpiresAt),
          sql`${bedReservations.holdExpiresAt} > now()`,
        ),
        sql`${refDate}::date <@ ${bedReservations.stayRange}`,
      ),
    );

  const [{ pendingCount }] = await db
    .select({
      pendingCount: sql<number>`count(distinct ${bookings.id})::int`,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, roomId),
        isNull(beds.archivedAt),
        eq(bookings.status, 'pending_payment'),
        inArray(bedReservations.status, ['hold', 'active']),
      ),
    );

  const [{ leavingSoon }] = await db
    .select({
      leavingSoon: sql<number>`count(distinct ${beds.id})::int`,
    })
    .from(vacatingRequests)
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, roomId),
        isNull(beds.archivedAt),
        eq(bedReservations.status, 'active'),
        inArray(vacatingRequests.status, ['pending', 'approved']),
        sql`${vacatingRequests.vacatingDate} >= ${refDate}::date`,
      ),
    );

  let uniqueViewers7d: number | null = null;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [{ viewers }] = await db
      .select({
        viewers: sql<number>`count(distinct ${roomPageViews.visitorKey})::int`,
      })
      .from(roomPageViews)
      .where(and(eq(roomPageViews.roomId, roomId), gte(roomPageViews.viewedAt, sevenDaysAgo)));
    uniqueViewers7d = viewers;
  } catch {
    uniqueViewers7d = null;
  }

  return {
    bedsTotal,
    bedsAvailableNow,
    bedsOccupiedNow,
    bedsLeavingSoon: leavingSoon,
    interestedBookings: interestCount,
    pendingPayments: pendingCount,
    uniqueViewers7d,
  };
}

/** Verify room belongs to PG before recording views. */
export async function roomBelongsToPgSlug(pgSlug: string, roomId: string): Promise<boolean> {
  const [row] = await db
    .select({ roomId: rooms.id })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(rooms.id, roomId), eq(pgs.slug, pgSlug), isNull(rooms.archivedAt)))
    .limit(1);
  return Boolean(row);
}
