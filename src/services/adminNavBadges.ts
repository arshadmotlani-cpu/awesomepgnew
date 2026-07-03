import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import { getWaitingForApprovalCount } from '@/src/services/approvalService';
import { loadUnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';
import {
  getOpenActionsCount,
  type UnresolvedBadgeBucket,
} from '@/src/services/unresolvedActions';

/** Sidebar badge keys — operations total from unified queue SSOT. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications', number>
>;

const BUCKET_TO_NAV: Record<UnresolvedBadgeBucket, keyof AdminNavBadges> = {
  operations: 'operations',
  payments: 'payments',
  kyc: 'kyc',
  checkout: 'checkoutSettlements',
};

/** Sidebar badges — operations queue uses unified SSOT; payments = WFA visible count. */
export async function loadAdminNavBadges(session: AdminSession): Promise<AdminNavBadges> {
  try {
    const badges: AdminNavBadges = {};
    const [operationsQueue, waitingForApproval, kycCount, checkoutCount] = await Promise.all([
      loadUnifiedOperationsQueue(session, null),
      getWaitingForApprovalCount(session),
      getOpenActionsCount(session, 'kyc'),
      getOpenActionsCount(session, 'checkout'),
    ]);

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
  } catch {
    return {};
  }
}
