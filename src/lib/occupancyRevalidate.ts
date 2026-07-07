import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReserveHolds, beds, bookings, floors, pgs, rooms } from '@/src/db/schema';

export type ReservationLifecycleRevalidateInput = {
  pgId?: string | null;
  pgSlug?: string | null;
  bookingCode?: string | null;
};

/** Shared list/layout paths — call once per mutation. */
export function revalidateReservationLifecycleBase(): void {
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
  } catch {
    // No-op outside Next.js request context (CLI scripts, background workers).
  }
}

/** Entity-specific paths only — does not repeat base invalidation. */
export function revalidateReservationLifecycleTargets(
  input?: ReservationLifecycleRevalidateInput,
): void {
  try {
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
    // No-op outside Next.js request context.
  }
}

/**
 * Bust cached RSC/router payloads for every surface that reads reservation
 * occupancy, booking status, or operations queue items.
 */
export function revalidateReservationLifecycleViews(
  input?: ReservationLifecycleRevalidateInput,
): void {
  revalidateReservationLifecycleBase();
  revalidateReservationLifecycleTargets(input);
}

/** @deprecated Prefer revalidateReservationLifecycleViews — kept for existing call sites. */
export function revalidateOccupancyViews(pgId?: string | null): void {
  revalidateReservationLifecycleViews({ pgId });
}

/** Resolve PG + booking codes then revalidate — base once, each target once. */
export async function revalidateReservationLifecycleForBookingIds(
  bookingIds: string[],
): Promise<void> {
  revalidateReservationLifecycleBase();

  if (bookingIds.length === 0) return;

  const uniqueIds = [...new Set(bookingIds)];
  const rows = await db
    .select({
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

  const bookingCodes = new Set<string>();
  const pgIds = new Set<string>();
  const pgSlugs = new Set<string>();
  for (const row of rows) {
    if (row.bookingCode) bookingCodes.add(row.bookingCode);
    if (row.pgId) pgIds.add(row.pgId);
    if (row.pgSlug) pgSlugs.add(row.pgSlug);
  }

  for (const bookingCode of bookingCodes) {
    revalidateReservationLifecycleTargets({ bookingCode });
  }
  for (const pgId of pgIds) {
    revalidateReservationLifecycleTargets({ pgId });
  }
  for (const pgSlug of pgSlugs) {
    revalidateReservationLifecycleTargets({ pgSlug });
  }
}

export async function revalidateReservationLifecycleForBookingId(
  bookingId: string,
): Promise<void> {
  await revalidateReservationLifecycleForBookingIds([bookingId]);
}
