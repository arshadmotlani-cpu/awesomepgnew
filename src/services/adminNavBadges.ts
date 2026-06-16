import type { AdminSession } from '@/src/lib/auth/session';
import type { AdminModule } from '@/src/lib/admin/navigation';
import {
  listAdminNotifications,
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
    const unread = await listAdminNotifications(session, 'unread', 500);
    const badges: AdminNavBadges = {};

    for (const n of unread) {
      const mod = TYPE_TO_MODULE[n.type] ?? 'overview';
      badges[mod] = (badges[mod] ?? 0) + 1;
    }

    badges.overview = unread.length;
    badges.notifications = unread.length;
    return badges;
  } catch {
    return {};
  }
}
