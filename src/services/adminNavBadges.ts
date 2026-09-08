import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionItems,
  bedReservations,
  beds,
  checkoutSettlements,
  floors,
  kycSubmissions,
  pgPaymentRecords,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';
import { countActionableUnreadForAdmin } from '@/src/services/notificationEngine';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';

/** Sidebar badge keys — cheap COUNT queries, not the full Operations queue. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications' | 'moveOut', number>
>;

const BADGE_CACHE_TTL_MS = 45_000;
let badgeCache: { scopeKey: string; at: number; badges: AdminNavBadges } | null = null;

function readCachedBadges(scopeKey: string): AdminNavBadges | null {
  if (!badgeCache || badgeCache.scopeKey !== scopeKey) return null;
  if (Date.now() - badgeCache.at >= BADGE_CACHE_TTL_MS) return null;
  return badgeCache.badges;
}

function writeCachedBadges(scopeKey: string, badges: AdminNavBadges): void {
  badgeCache = { scopeKey, at: Date.now(), badges };
}

function pgScopeIds(session: AdminSession): string[] | null {
  if (session.role === 'super_admin') return null;
  if (!session.pgScope.length) return null;
  return session.pgScope;
}

function positive(n: number): number | undefined {
  return n > 0 ? n : undefined;
}

async function countOpenActionItems(session: AdminSession): Promise<number> {
  const scope = pgScopeIds(session);
  const conditions = [inArray(actionItems.status, ['open', 'in_progress'])];
  if (scope) conditions.push(inArray(actionItems.pgId, scope));
  const [row] = await db.select({ n: count() }).from(actionItems).where(and(...conditions));
  return Number(row?.n ?? 0);
}

async function countPendingPaymentProofs(session: AdminSession): Promise<number> {
  const scope = pgScopeIds(session);
  const conditions = [eq(pgPaymentRecords.status, 'pending')];
  if (scope) conditions.push(inArray(pgPaymentRecords.pgId, scope));
  const [row] = await db
    .select({ n: count() })
    .from(pgPaymentRecords)
    .where(and(...conditions));
  return Number(row?.n ?? 0);
}

async function countPendingKyc(session: AdminSession): Promise<number> {
  const scope = pgScopeIds(session);
  if (!scope) {
    const [row] = await db
      .select({ n: count() })
      .from(kycSubmissions)
      .where(eq(kycSubmissions.status, 'pending'));
    return Number(row?.n ?? 0);
  }

  const [row] = await db
    .select({ n: sql<number>`count(distinct ${kycSubmissions.id})::int` })
    .from(kycSubmissions)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, kycSubmissions.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(kycSubmissions.status, 'pending'), inArray(floors.pgId, scope)));
  return Number(row?.n ?? 0);
}

async function countActiveVacating(session: AdminSession): Promise<number> {
  const scope = pgScopeIds(session);
  const statusFilter = inArray(vacatingRequests.status, ['pending', 'approved']);
  if (!scope) {
    const [row] = await db.select({ n: count() }).from(vacatingRequests).where(statusFilter);
    return Number(row?.n ?? 0);
  }

  const [row] = await db
    .select({ n: sql<number>`count(distinct ${vacatingRequests.id})::int` })
    .from(vacatingRequests)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, vacatingRequests.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(statusFilter, inArray(floors.pgId, scope)));
  return Number(row?.n ?? 0);
}

async function countRefundPending(session: AdminSession): Promise<number> {
  const scope = pgScopeIds(session);
  const statusFilter = eq(checkoutSettlements.status, 'refund_pending');
  if (!scope) {
    const [row] = await db.select({ n: count() }).from(checkoutSettlements).where(statusFilter);
    return Number(row?.n ?? 0);
  }

  const [row] = await db
    .select({ n: sql<number>`count(distinct ${checkoutSettlements.id})::int` })
    .from(checkoutSettlements)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, checkoutSettlements.bookingId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(statusFilter, inArray(floors.pgId, scope)));
  return Number(row?.n ?? 0);
}

/** Sidebar badges — COUNT queries only. Operations page still uses the unified queue. */
async function loadAdminNavBadgeCounts(session: AdminSession): Promise<AdminNavBadges> {
  const [operations, payments, kyc, moveOut, checkoutSettlementsCount, notifications] =
    await Promise.all([
      countOpenActionItems(session),
      countPendingPaymentProofs(session),
      countPendingKyc(session),
      countActiveVacating(session),
      countRefundPending(session),
      countActionableUnreadForAdmin(session),
    ]);

  const badges: AdminNavBadges = {};
  const operationsBadge = operations;
  if (operationsBadge > 0) badges.operations = operationsBadge;
  const paymentsBadge = positive(payments);
  if (paymentsBadge) badges.payments = paymentsBadge;
  const kycBadge = positive(kyc);
  if (kycBadge) badges.kyc = kycBadge;
  const moveOutBadge = positive(moveOut);
  if (moveOutBadge) badges.moveOut = moveOutBadge;
  const refundBadge = positive(checkoutSettlementsCount);
  if (refundBadge) badges.checkoutSettlements = refundBadge;
  if (notifications > 0) badges.notifications = notifications;
  return badges;
}

export type LoadAdminNavBadgesOptions = {
  /** Use in-memory TTL cache (layout SSR + live poll). */
  pollCache?: boolean;
  /** @deprecated All badge loads use COUNT queries; kept for script compatibility. */
  fullQueue?: boolean;
};

/**
 * Sidebar badges — cheap COUNT queries.
 * The Operations page remains the SSOT via getUnifiedOperationsQueueForRequest.
 */
export async function loadAdminNavBadges(
  session: AdminSession,
  opts?: LoadAdminNavBadgesOptions,
): Promise<AdminNavBadges> {
  const scopeKey = adminRequestScopeKey(session);
  const cached = opts?.pollCache !== false ? readCachedBadges(scopeKey) : null;
  if (cached) return cached;

  try {
    const badges = await profileAdminStep('loadAdminNavBadges', async () =>
      loadAdminNavBadgeCounts(session),
    );

    writeCachedBadges(scopeKey, badges);
    return badges;
  } catch {
    return readCachedBadges(scopeKey) ?? {};
  }
}

/** Test/profiling — reset in-process badge cache. */
export function resetAdminNavBadgeCache(): void {
  badgeCache = null;
}
