import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';
import { deriveAdminNavBadgesFromOperationsQueue } from '@/src/lib/operations/operationsQueueCounts';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';
import { countActionableUnreadForAdmin } from '@/src/services/notificationEngine';
import { getUnifiedOperationsQueueForBadges } from '@/src/services/unifiedOperationsQueue';

/** Sidebar badge keys — Operations counts come from the unified queue SSOT. */
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

function positive(n: number): number | undefined {
  return n > 0 ? n : undefined;
}

/** Sidebar badges — unified Operations queue SSOT + independent notification bell. */
async function loadAdminNavBadgeCounts(session: AdminSession): Promise<AdminNavBadges> {
  const queue = await getUnifiedOperationsQueueForBadges(session);
  const opsBadges = deriveAdminNavBadgesFromOperationsQueue(queue);

  let notifications = 0;
  try {
    notifications = await countActionableUnreadForAdmin(session);
  } catch {
    // Notification bell is independent — never block Operations badge counts.
  }
  const badges: AdminNavBadges = {};

  const operationsBadge = positive(opsBadges.operations);
  if (operationsBadge) badges.operations = operationsBadge;

  const paymentsBadge = positive(opsBadges.payments);
  if (paymentsBadge) badges.payments = paymentsBadge;

  const kycBadge = positive(opsBadges.kyc);
  if (kycBadge) badges.kyc = kycBadge;

  const moveOutBadge = positive(opsBadges.moveOut);
  if (moveOutBadge) badges.moveOut = moveOutBadge;

  const refundBadge = positive(opsBadges.checkoutSettlements);
  if (refundBadge) badges.checkoutSettlements = refundBadge;

  if (notifications > 0) badges.notifications = notifications;
  return badges;
}

export type LoadAdminNavBadgesOptions = {
  /** Use in-memory TTL cache (layout SSR + live poll). */
  pollCache?: boolean;
  /** @deprecated All badge loads use the unified Operations queue SSOT. */
  fullQueue?: boolean;
};

/**
 * Sidebar badges — Operations workload from getUnifiedOperationsQueueForBadges.
 * Notification bell uses actionable unread count only (never inflates Operations).
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
