/**
 * Admin notifications for billing scheduler batch results.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminUsers } from '@/src/db/schema';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';
import { emitNotificationToAdmins } from '@/src/services/notificationEngine';

async function allActiveAdminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.isActive, true));
  return rows.map((r) => r.id);
}

export async function notifyRentBatchGeneration(input: {
  runId: string;
  createdCount: number;
  failedCount: number;
}): Promise<void> {
  const adminIds = await allActiveAdminIds();
  if (adminIds.length === 0) return;

  if (input.createdCount > 0) {
    await emitNotificationToAdmins(adminIds, {
      type: 'rent_batch_generated',
      title: `${input.createdCount} monthly rent invoice${input.createdCount === 1 ? '' : 's'} generated`,
      body: 'Automatic billing completed overnight. Review in Billing Center.',
      deepLink: '/admin/billing?tab=generated',
      dedupeKey: `rent_batch_generated:${input.runId}`,
      priority: 'informational',
    });
  }
  if (input.failedCount > 0) {
    await emitNotificationToAdmins(adminIds, {
      type: 'rent_batch_failed',
      title: `${input.failedCount} invoice generation${input.failedCount === 1 ? '' : 's'} failed`,
      body: 'Some residents were not billed. Retry from Billing Center.',
      deepLink: '/admin/billing?tab=failures',
      dedupeKey: `rent_batch_failed:${input.runId}`,
      priority: 'important',
    });
  }
  scheduleAdminNotificationSync();
}
