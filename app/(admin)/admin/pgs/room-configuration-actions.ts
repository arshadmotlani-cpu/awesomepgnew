'use server';

import { revalidatePath } from 'next/cache';
import { revalidatePublicPgBrowseCache } from '@/src/lib/cache/revalidatePublicPg';
import { revalidatePgAdminPages } from '@/src/lib/revalidatePgAdmin';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { cancelRoomConfigurationSchedule } from '@/src/services/roomConfigurationSchedule';

export async function cancelRoomConfigurationScheduleAction(
  pgId: string,
  scheduleId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    await cancelRoomConfigurationSchedule(session, pgId, scheduleId, reason);
    revalidatePgAdminPages(pgId);
    revalidatePublicPgBrowseCache({ pgId });
    revalidatePath('/admin/beds');
    revalidatePath('/admin/pricing');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
