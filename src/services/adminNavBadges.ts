import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';
import {
  operationsFilterCount,
  operationsTotalPendingCount,
} from '@/src/lib/operations/operationsQueueCounts';
import { getUnifiedOperationsQueueForBadges } from '@/src/services/unifiedOperationsQueue';
import { countUnreadForAdmin } from '@/src/services/notificationEngine';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';

/** Sidebar badge keys — all Operations tab counts from unified queue SSOT. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications', number>
>;

function badgeFromFilterCount(
  queue: Awaited<ReturnType<typeof getUnifiedOperationsQueueForBadges>>,
  filter: OpsQueueFilter,
): number | undefined {
  const count = operationsFilterCount(queue, filter);
  return count > 0 ? count : undefined;
}

/**
 * Sidebar badges — Operations totals from the unified queue SSOT.
 * Overview is a read-only owner dashboard and must never show action badges.
 */
const BADGE_POLL_CACHE_TTL_MS = 45_000;
let badgePollCache: { scopeKey: string; at: number; badges: AdminNavBadges } | null = null;

export async function loadAdminNavBadges(
  session: AdminSession,
  opts?: { pollCache?: boolean },
): Promise<AdminNavBadges> {
  const scopeKey = adminRequestScopeKey(session);
  if (opts?.pollCache && badgePollCache) {
    const age = Date.now() - badgePollCache.at;
    if (badgePollCache.scopeKey === scopeKey && age < BADGE_POLL_CACHE_TTL_MS) {
      return badgePollCache.badges;
    }
  }

  try {
    const badges = await profileAdminStep('loadAdminNavBadges', async () => {
      const operationsQueue = await getUnifiedOperationsQueueForBadges(session);
      const badges: AdminNavBadges = {};

      const pendingTotal = operationsTotalPendingCount(operationsQueue);
      if (pendingTotal > 0) {
        badges.operations = pendingTotal;
      }

      const waitingForApproval = badgeFromFilterCount(operationsQueue, 'waiting_for_approval');
      if (waitingForApproval) badges.payments = waitingForApproval;

      const kyc = badgeFromFilterCount(operationsQueue, 'kyc_review');
      if (kyc) badges.kyc = kyc;

      const checkoutSettlements = badgeFromFilterCount(operationsQueue, 'refund_due');
      if (checkoutSettlements) badges.checkoutSettlements = checkoutSettlements;

      const unreadNotifications = await countUnreadForAdmin(session);
      if (unreadNotifications > 0) {
        badges.notifications = unreadNotifications;
      }

      return badges;
    });

    if (opts?.pollCache) {
      badgePollCache = { scopeKey, at: Date.now(), badges };
    }

    return badges;
  } catch {
    return {};
  }
}
