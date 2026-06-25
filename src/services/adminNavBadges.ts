import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import {
  getOpenActionsCount,
  type UnresolvedBadgeBucket,
} from '@/src/services/unresolvedActions';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';

/** Sidebar badge keys — all module counts from unresolved_actions SSOT. */
export type AdminNavBadges = Partial<
  Record<AdminModule | 'payments' | 'notifications', number>
>;

const BUCKET_TO_NAV: Record<UnresolvedBadgeBucket, keyof AdminNavBadges> = {
  operations: 'operations',
  payments: 'payments',
  kyc: 'kyc',
  checkout: 'checkoutSettlements',
};

/** Sidebar badges — open unresolved_actions only (notifications bell is separate). */
export async function loadAdminNavBadges(session: AdminSession): Promise<AdminNavBadges> {
  try {
    const badges: AdminNavBadges = {};
    const buckets: UnresolvedBadgeBucket[] = ['operations', 'payments', 'kyc', 'checkout'];
    let total = 0;

    for (const bucket of buckets) {
      const count =
        bucket === 'operations'
          ? (await loadResidentOperationsResidentsPage(session, null)).allQueueCount
          : await getOpenActionsCount(session, bucket);
      if (count > 0) {
        badges[BUCKET_TO_NAV[bucket]] = count;
        total += count;
      }
    }

    badges.overview = total;
    return badges;
  } catch {
    return {};
  }
}
