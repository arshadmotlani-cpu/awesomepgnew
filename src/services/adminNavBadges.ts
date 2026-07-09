import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import { operationsFilterCount } from '@/src/lib/operations/operationsQueueCounts';
import { getUnifiedOperationsQueueForRequest } from '@/src/services/unifiedOperationsQueue';
import { countUnreadForAdmin } from '@/src/services/notificationEngine';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';

/** Sidebar badge keys — all Operations tab counts from unified queue SSOT. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications', number>
>;

function badgeFromFilterCount(
  queue: Awaited<ReturnType<typeof getUnifiedOperationsQueueForRequest>>,
  filter: OpsQueueFilter,
): number | undefined {
  const count = operationsFilterCount(queue, filter);
  return count > 0 ? count : undefined;
}

/** Sidebar badges — single unified queue load per request. */
export async function loadAdminNavBadges(session: AdminSession): Promise<AdminNavBadges> {
  try {
    return await profileAdminStep('loadAdminNavBadges', async () => {
      const operationsQueue = await getUnifiedOperationsQueueForRequest(session, null);
      const badges: AdminNavBadges = {};

      if (operationsQueue.totalCount > 0) {
        badges.operations = operationsQueue.totalCount;
      }

      const waitingForApproval = badgeFromFilterCount(operationsQueue, 'waiting_for_approval');
      if (waitingForApproval) badges.payments = waitingForApproval;

      const kyc = badgeFromFilterCount(operationsQueue, 'kyc_review');
      if (kyc) badges.kyc = kyc;

      const checkoutSettlements = badgeFromFilterCount(operationsQueue, 'refund_due');
      if (checkoutSettlements) badges.checkoutSettlements = checkoutSettlements;

      const total =
        (badges.operations ?? 0) + (badges.kyc ?? 0) + (badges.checkoutSettlements ?? 0);
      if (total > 0) badges.overview = total;

      const unreadNotifications = await countUnreadForAdmin(session);
      if (unreadNotifications > 0) {
        badges.notifications = unreadNotifications;
      }

      return badges;
    });
  } catch {
    return {};
  }
}
