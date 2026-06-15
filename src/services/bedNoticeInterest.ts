import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedNoticeInterest, bedReservations, beds, bookings, vacatingRequests } from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';

function visitorKey(customerId: string | null, ip: string | null, userAgent: string | null): string {
  if (customerId) return `c:${customerId}`;
  const raw = `${ip ?? 'unknown'}|${userAgent ?? ''}`;
  return `a:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

/** True when the bed has an active occupant with pending/approved vacating notice. */
export async function bedIsInNoticePeriod(bedId: string): Promise<boolean> {
  const refDate = todayString();
  const [row] = await db
    .select({ id: vacatingRequests.id })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(vacatingRequests, eq(vacatingRequests.bookingId, bookings.id))
    .where(
      sql`${bedReservations.bedId} = ${bedId}
        AND ${bedReservations.status} = 'active'
        AND ${bookings.status} = 'confirmed'
        AND ${vacatingRequests.status} IN ('pending', 'approved')
        AND ${refDate}::date <@ ${bedReservations.stayRange}`,
    )
    .limit(1);
  return Boolean(row);
}

/** Bed is bookable now (available) — visitors can register interest. */
export async function bedIsAvailableForInterest(bedId: string): Promise<boolean> {
  const refDate = todayString();
  const [bed] = await db
    .select({ status: beds.status, manualOccupied: beds.manualOccupied })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!bed || bed.status !== 'available' || bed.manualOccupied) return false;

  const [activeStay] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .where(
      sql`${bedReservations.bedId} = ${bedId}
        AND ${bedReservations.status} = 'active'
        AND ${refDate}::date <@ ${bedReservations.stayRange}`,
    )
    .limit(1);

  return !activeStay;
}

/** Record visitor interest for notice-period OR currently available beds. */
export async function recordBedNoticeInterest(input: {
  bedId: string;
  customerId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true; recorded: boolean; totalInterest: number } | { ok: false; message: string }> {
  const [inNotice, available] = await Promise.all([
    bedIsInNoticePeriod(input.bedId),
    bedIsAvailableForInterest(input.bedId),
  ]);

  if (!inNotice && !available) {
    return { ok: false, message: 'This bed is not open for interest tracking.' };
  }

  const key = visitorKey(input.customerId ?? null, input.ip ?? null, input.userAgent ?? null);

  try {
    await db
      .insert(bedNoticeInterest)
      .values({ bedId: input.bedId, visitorKey: key })
      .onConflictDoNothing({ target: [bedNoticeInterest.bedId, bedNoticeInterest.visitorKey] });

    const total = await getBedNoticeInterestCount(input.bedId);
    return { ok: true, recorded: true, totalInterest: total };
  } catch {
    return { ok: false, message: 'Could not record interest.' };
  }
}

/** Reset interest when a bed is booked — fresh count when it becomes vacant again. */
export async function clearBedInterest(bedId: string): Promise<void> {
  await db.delete(bedNoticeInterest).where(eq(bedNoticeInterest.bedId, bedId));
}

export async function clearBedInterestForBooking(bookingId: string): Promise<void> {
  const rows = await db
    .select({ bedId: bedReservations.bedId })
    .from(bedReservations)
    .where(eq(bedReservations.bookingId, bookingId));

  for (const row of rows) {
    await clearBedInterest(row.bedId);
  }
}

export async function getBedNoticeInterestCount(bedId: string): Promise<number> {
  try {
    const [row] = await db
      .select({
        count: sql<number>`count(distinct ${bedNoticeInterest.visitorKey})::int`,
      })
      .from(bedNoticeInterest)
      .where(eq(bedNoticeInterest.bedId, bedId));
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function getNoticeInterestCountsForBeds(
  bedIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bedIds.length === 0) return map;

  try {
    const rows = await db
      .select({
        bedId: bedNoticeInterest.bedId,
        count: sql<number>`count(distinct ${bedNoticeInterest.visitorKey})::int`,
      })
      .from(bedNoticeInterest)
      .where(sql`${bedNoticeInterest.bedId} = ANY(${bedIds}::uuid[])`)
      .groupBy(bedNoticeInterest.bedId);

    for (const row of rows) {
      map.set(row.bedId, row.count);
    }
  } catch {
    // table may not exist yet
  }
  return map;
}
