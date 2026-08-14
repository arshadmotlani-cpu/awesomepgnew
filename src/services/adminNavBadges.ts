import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';
import {
  operationsFilterCount,
  operationsTotalPendingCount,
} from '@/src/lib/operations/operationsQueueCounts';
import { getUnifiedOperationsQueueForBadges } from '@/src/services/unifiedOperationsQueue';
import { countActionableUnreadForAdmin } from '@/src/services/notificationEngine';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';

/** Sidebar badge keys — all Operations tab counts from unified queue SSOT. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications' | 'moveOut', number>
>;

function badgeFromFilterCount(
  queue: Awaited<ReturnType<typeof getUnifiedOperationsQueueForBadges>>,
  filter: OpsQueueFilter,
): number | undefined {
  const count = operationsFilterCount(queue, filter);
  return count > 0 ? count : undefined;
}

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

/** Sidebar badges — unified Operations queue SSOT (same build as Operations page). */
async function loadAdminNavBadgesFromQueue(session: AdminSession): Promise<AdminNavBadges> {
  const operationsQueue = await getUnifiedOperationsQueueForBadges(session);
  const badges: AdminNavBadges = {};

  const pendingTotal = operationsTotalPendingCount(operationsQueue);
  if (pendingTotal > 0) badges.operations = pendingTotal;

  const waitingForApproval = badgeFromFilterCount(operationsQueue, 'waiting_for_approval');
  if (waitingForApproval) badges.payments = waitingForApproval;

  const kyc = badgeFromFilterCount(operationsQueue, 'kyc_review');
  if (kyc) badges.kyc = kyc;

  const checkoutSettlements = badgeFromFilterCount(operationsQueue, 'refund_due');
  if (checkoutSettlements) badges.checkoutSettlements = checkoutSettlements;

  const moveOut = badgeFromFilterCount(operationsQueue, 'vacating_requests');
  if (moveOut) badges.moveOut = moveOut;

  const actionableNotifications = await countActionableUnreadForAdmin(session);
  if (actionableNotifications > 0) badges.notifications = actionableNotifications;

  return badges;
}

export type LoadAdminNavBadgesOptions = {
  /** Use in-memory TTL cache (layout SSR + live poll). */
  pollCache?: boolean;
  /** @deprecated All badge loads use the unified queue; kept for script compatibility. */
  fullQueue?: boolean;
};

/**
 * Sidebar badges — must match Operations page queue totals (unified SSOT).
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
      loadAdminNavBadgesFromQueue(session),
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
