import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReserveHolds, beds, bookings, floors, pgs, rooms } from '@/src/db/schema';

export type ReservationLifecycleRevalidateInput = {
  pgId?: string | null;
  pgSlug?: string | null;
  bookingCode?: string | null;
};

/**
 * Bust cached RSC/router payloads for every surface that reads reservation
 * occupancy, booking status, or operations queue items.
 */
export function revalidateReservationLifecycleViews(
  input?: ReservationLifecycleRevalidateInput,
): void {
  try {
    revalidatePath('/pgs');
    revalidatePath('/account/bookings');
    revalidatePath('/account/profile');
    revalidatePath('/reserve/new');
    revalidatePath('/admin/overview');
    revalidatePath('/admin/operations', 'layout');
    revalidatePath('/admin/pgs', 'layout');
    revalidatePath('/admin/bookings', 'layout');
    revalidatePath('/admin/residents', 'layout');
    revalidatePath('/admin/beds', 'layout');
    revalidatePath('/admin/quick-actions');
    revalidatePath('/admin/payments');

    if (input?.pgSlug) {
      revalidatePath(`/pgs/${input.pgSlug}`);
    }
    if (input?.bookingCode) {
      revalidatePath(`/booking/${input.bookingCode}`);
      revalidatePath(`/booking/${input.bookingCode}/pay`);
    }
    if (input?.pgId) {
      revalidatePath(`/admin/pgs/${input.pgId}/map`);
      revalidatePath(`/admin/pgs/${input.pgId}/rooms`);
    }
  } catch {
    // No-op outside Next.js request context (CLI scripts, background workers).
  }
}

/** @deprecated Prefer revalidateReservationLifecycleViews — kept for existing call sites. */
export function revalidateOccupancyViews(pgId?: string | null): void {
  revalidateReservationLifecycleViews({ pgId });
}

/** Resolve PG + booking codes then revalidate all dependent customer/admin views. */
export async function revalidateReservationLifecycleForBookingIds(
  bookingIds: string[],
): Promise<void> {
  if (bookingIds.length === 0) return;

  const uniqueIds = [...new Set(bookingIds)];
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      pgId: floors.pgId,
      pgSlug: pgs.slug,
    })
    .from(bookings)
    .leftJoin(bedReserveHolds, eq(bedReserveHolds.bookingId, bookings.id))
    .leftJoin(beds, eq(beds.id, bedReserveHolds.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
    .leftJoin(floors, eq(floors.id, rooms.floorId))
    .leftJoin(pgs, eq(pgs.id, floors.pgId))
    .where(inArray(bookings.id, uniqueIds));

  const pgIds = new Set<string>();
  const pgSlugs = new Set<string>();
  for (const row of rows) {
    revalidateReservationLifecycleViews({
      bookingCode: row.bookingCode,
      pgId: row.pgId,
      pgSlug: row.pgSlug,
    });
    if (row.pgId) pgIds.add(row.pgId);
    if (row.pgSlug) pgSlugs.add(row.pgSlug);
  }

  // Broad invalidation when joins miss (draft without hold yet).
  revalidateReservationLifecycleViews();
  for (const pgId of pgIds) {
    revalidateReservationLifecycleViews({ pgId });
  }
  for (const pgSlug of pgSlugs) {
    revalidateReservationLifecycleViews({ pgSlug });
  }
}

export async function revalidateReservationLifecycleForBookingId(
  bookingId: string,
): Promise<void> {
  await revalidateReservationLifecycleForBookingIds([bookingId]);
}
