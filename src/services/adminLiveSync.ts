/**
 * Event-driven admin notification sync.
 * Call after resident/admin writes so badges update without waiting for cron.
 * Dedupe is enforced per source_key in notificationEngine.emitAdminNotificationsForActionItem.
 */

import { logger } from '@/src/lib/logger';
import { revalidateAdminSurfaces } from '@/src/lib/admin/revalidateSurfaces';

export async function triggerAdminNotificationSync(): Promise<void> {
  try {
    const { syncActionItemsForCron } = await import('@/src/services/actionItems');
    await syncActionItemsForCron();
    revalidateAdminSurfaces();
  } catch (err) {
    logger.error('admin notification sync failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Fire-and-forget — safe from request handlers and services. */
export function scheduleAdminNotificationSync(): void {
  void triggerAdminNotificationSync();
}
