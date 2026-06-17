import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import {
  listUnreadNotificationTypesForBadges,
  type AdminNotificationRow,
} from '@/src/services/adminNotifications';

export type AdminNavBadges = Partial<Record<AdminModule | 'deposits' | 'notifications', number>>;

const TYPE_TO_MODULE: Record<AdminNotificationRow['type'], AdminModule | 'deposits'> = {
  kyc_pending: 'kyc',
  rent_due: 'collections',
  electricity_due: 'collections',
  payment_received: 'collections',
  vacating_alert: 'operations',
  extension_request: 'operations',
  maintenance_issue: 'operations',
  refund_pending: 'deposits',
  deposit_refund_request: 'deposits',
  deposit_collection_due: 'deposits',
};

/** Sidebar badges — unread notifications only (WhatsApp-style). */
export async function loadAdminNavBadges(session: AdminSession): Promise<AdminNavBadges> {
  try {
    const types = await listUnreadNotificationTypesForBadges(session);
    const badges: AdminNavBadges = {};

    for (const type of types) {
      const mod = TYPE_TO_MODULE[type] ?? 'overview';
      badges[mod] = (badges[mod] ?? 0) + 1;
    }

    badges.overview = types.length;
    badges.notifications = types.length;
    return badges;
  } catch {
    return {};
  }
}
