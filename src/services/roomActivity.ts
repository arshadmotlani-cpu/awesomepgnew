import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  roomPageViews,
  vacatingRequests,
} from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';
import { getOccupancyCountsByRoom } from '@/src/services/bedOccupancyBatch';

export type RoomActivityStats = {
  bedsTotal: number;
  bedsAvailableNow: number;
  bedsOccupiedNow: number;
  bedsLeavingSoon: number;
  interestedBookings: number;
  pendingPayments: number;
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
  const countsByRoom = await getOccupancyCountsByRoom([roomId], refDate);
  const counts = countsByRoom.get(roomId);
  const bedsTotal = counts?.totalBeds ?? 0;
  const bedsAvailableNow = counts?.openNowBeds ?? 0;
  const bedsOccupiedNow = counts?.occupiedBeds ?? 0;

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
        eq(bedReservations.status, 'hold'),
      ),
    );

  const [{ leavingSoon }] = await db
    .select({
      leavingSoon: sql<number>`count(distinct ${beds.id})::int`,
    })
    .from(beds)
    .innerJoin(bedReservations, eq(bedReservations.bedId, beds.id))
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(vacatingRequests, eq(vacatingRequests.bookingId, bookings.id))
    .where(
      and(
        eq(beds.roomId, roomId),
        isNull(beds.archivedAt),
        eq(bedReservations.status, 'active'),
        eq(bookings.status, 'confirmed'),
        sql`${vacatingRequests.status} IN ('pending', 'approved')`,
        sql`${refDate}::date <@ ${bedReservations.stayRange}`,
      ),
    );

  let uniqueViewers7d: number | null = null;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [{ count }] = await db
      .select({
        count: sql<number>`count(distinct ${roomPageViews.visitorKey})::int`,
      })
      .from(roomPageViews)
      .where(
        and(eq(roomPageViews.roomId, roomId), gte(roomPageViews.viewedAt, sevenDaysAgo)),
      );
    uniqueViewers7d = count;
  } catch {
    uniqueViewers7d = null;
  }

  return {
    bedsTotal,
    bedsAvailableNow,
    bedsOccupiedNow,
    bedsLeavingSoon: leavingSoon ?? 0,
    interestedBookings: interestCount ?? 0,
    pendingPayments: pendingCount ?? 0,
    uniqueViewers7d,
  };
}
