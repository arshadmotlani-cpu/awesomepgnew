'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { dispatchSafeRepairs } from '@/src/lib/health/repairEngine';
import { formatPostgresError } from '@/src/lib/db/postgresError';

export async function runBrainIssueRepairAction(fingerprint: string) {
  await requireAdminPermission('payments:write');
  try {
    const result = await dispatchSafeRepairs({
      trigger: 'ui',
      onlyFingerprint: fingerprint,
    });
    revalidatePath('/admin/system');
    revalidatePath('/admin/system/health-report');
    revalidatePath('/admin/overview');
    return { ok: true as const, ...result };
  } catch (err) {
    return { ok: false as const, message: formatPostgresError(err) };
  }
}

export async function runAllSafeBrainRepairsAction() {
  await requireAdminPermission('payments:write');
  try {
    const { runAllBrainIntegrityAudits } = await import('@/src/lib/health/healthBrain');
    await runAllBrainIntegrityAudits({
      runSafeRepairs: true,
      persistDurableIssues: true,
      persistIncidents: true,
      repairTrigger: 'ui',
    });
    revalidatePath('/admin/system');
    revalidatePath('/admin/system/health-report');
    revalidatePath('/admin/overview');
  } catch (err) {
    console.error('[runAllSafeBrainRepairsAction]', formatPostgresError(err));
  }
}
