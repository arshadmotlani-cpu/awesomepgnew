/**
 * Bust Redis public browse caches when room availability or occupancy changes.
 * Safe to call without Redis — no-ops when unconfigured.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, floors, pgs, rooms } from '@/src/db/schema';
import { resolvePgIdForBooking } from '@/src/lib/auth/pgAccess';
import { invalidatePublicPgCache } from '@/src/lib/cache/invalidate';
import { revalidatePublicPgBrowseCache } from '@/src/lib/cache/revalidatePublicPg';

export type AvailabilityCacheScope = {
  pgId?: string | null;
  pgSlug?: string | null;
  bookingId?: string | null;
  bedId?: string | null;
  roomId?: string | null;
};

async function resolvePgSlug(pgId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: pgs.slug })
    .from(pgs)
    .where(eq(pgs.id, pgId))
    .limit(1);
  return row?.slug ?? null;
}

async function resolvePgFromBed(bedId: string): Promise<{ pgId: string; pgSlug: string | null } | null> {
  const [row] = await db
    .select({ pgId: floors.pgId, pgSlug: pgs.slug })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!row?.pgId) return null;
  return { pgId: row.pgId, pgSlug: row.pgSlug ?? null };
}

async function resolvePgFromRoom(roomId: string): Promise<{ pgId: string; pgSlug: string | null } | null> {
  const [row] = await db
    .select({ pgId: floors.pgId, pgSlug: pgs.slug })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!row?.pgId) return null;
  return { pgId: row.pgId, pgSlug: row.pgSlug ?? null };
}

export async function resolveAvailabilityPgContext(
  scope: AvailabilityCacheScope,
): Promise<{ pgId: string; pgSlug: string | null } | null> {
  if (scope.pgId) {
    const pgSlug = scope.pgSlug ?? (await resolvePgSlug(scope.pgId));
    return { pgId: scope.pgId, pgSlug };
  }

  if (scope.pgSlug) {
    const [row] = await db
      .select({ id: pgs.id })
      .from(pgs)
      .where(eq(pgs.slug, scope.pgSlug))
      .limit(1);
    if (!row) return null;
    return { pgId: row.id, pgSlug: scope.pgSlug };
  }

  if (scope.bookingId) {
    const pgId = await resolvePgIdForBooking(scope.bookingId);
    if (!pgId) return null;
    const pgSlug = await resolvePgSlug(pgId);
    return { pgId, pgSlug };
  }

  if (scope.bedId) {
    return resolvePgFromBed(scope.bedId);
  }

  if (scope.roomId) {
    return resolvePgFromRoom(scope.roomId);
  }

  return null;
}

/** Invalidate public PG browse caches for the affected property. */
export async function invalidateAvailabilityCache(
  scope: AvailabilityCacheScope,
): Promise<void> {
  const ctx = await resolveAvailabilityPgContext(scope);
  if (!ctx) {
    await invalidatePublicPgCache();
    revalidatePublicPgBrowseCache();
    return;
  }

  await invalidatePublicPgCache({ pgId: ctx.pgId, pgSlug: ctx.pgSlug });
  revalidatePublicPgBrowseCache({ pgId: ctx.pgId, pgSlug: ctx.pgSlug });
}

/** Fire-and-forget — never blocks booking / occupancy mutations. */
export function scheduleAvailabilityCacheInvalidation(scope: AvailabilityCacheScope): void {
  void invalidateAvailabilityCache(scope).catch((err) => {
    console.warn('[cache] availability invalidation failed', {
      scope,
      err: err instanceof Error ? err.message : String(err),
    });
  });
}
