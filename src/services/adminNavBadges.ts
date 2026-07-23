import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import type { OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
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
 * Sidebar badges — Operations + Overview totals from the same unified queue as
 * `/admin/operations`. Never use the residents parallel queue for badge counts.
 */
export async function loadAdminNavBadges(session: AdminSession): Promise<AdminNavBadges> {
  try {
    return await profileAdminStep('loadAdminNavBadges', async () => {
      const operationsQueue = await getUnifiedOperationsQueueForBadges(session);
      const badges: AdminNavBadges = {};

      const pendingTotal = operationsTotalPendingCount(operationsQueue);
      if (pendingTotal > 0) {
        badges.operations = pendingTotal;
        // Overview badge = live pending ops total (same SSOT as Operations page).
        badges.overview = pendingTotal;
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
  } catch {
    return {};
  }
}
