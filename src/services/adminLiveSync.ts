/**
 * Event-driven admin notification sync.
 * Call after resident/admin writes so badges update without waiting for cron.
 */

import { logger } from '@/src/lib/logger';

export async function triggerAdminNotificationSync(): Promise<void> {
  try {
    const { syncActionItemsForCron } = await import('@/src/services/actionItems');
    await syncActionItemsForCron();
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
