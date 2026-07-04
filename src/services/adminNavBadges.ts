import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import { getUnifiedOperationsQueueForRequest } from '@/src/services/unifiedOperationsQueue';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';
import {
  getOpenActionsCount,
} from '@/src/services/unresolvedActions';

/** Sidebar badge keys — operations total from unified queue SSOT. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications', number>
>;

/** Sidebar badges — single unified queue load per request. */
export async function loadAdminNavBadges(session: AdminSession): Promise<AdminNavBadges> {
  try {
    return await profileAdminStep('loadAdminNavBadges', async () => {
      const badges: AdminNavBadges = {};
      const [operationsQueue, kycCount, checkoutCount] = await Promise.all([
        getUnifiedOperationsQueueForRequest(session, null),
        getOpenActionsCount(session, 'kyc'),
        getOpenActionsCount(session, 'checkout'),
      ]);

      const waitingForApproval =
        operationsQueue.filterCounts.find((c) => c.id === 'waiting_for_approval')?.count ?? 0;

      if (operationsQueue.totalCount > 0) {
        badges.operations = operationsQueue.totalCount;
      }
      if (waitingForApproval > 0) badges.payments = waitingForApproval;
      if (kycCount > 0) badges.kyc = kycCount;
      if (checkoutCount > 0) badges.checkoutSettlements = checkoutCount;

      const total =
        (badges.operations ?? 0) + (badges.kyc ?? 0) + (badges.checkoutSettlements ?? 0);
      if (total > 0) badges.overview = total;

      return badges;
    });
  } catch {
    return {};
  }
}
