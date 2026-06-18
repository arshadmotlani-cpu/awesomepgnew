'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  auditOccupancyMismatches,
  rebuildOccupancyState,
  summarizeOccupancyAudit,
  type OccupancyAuditRow,
  type OccupancyRebuildResult,
} from '@/src/services/occupancyDiagnostics';

export type OccupancyDiagnosticsActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; audit?: OccupancyAuditRow[]; summary?: ReturnType<typeof summarizeOccupancyAudit> }
  | { status: 'error'; message: string };

export async function auditOccupancyAction(
  _prev: OccupancyDiagnosticsActionState,
  _formData: FormData,
): Promise<OccupancyDiagnosticsActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    const audit = await auditOccupancyMismatches(session);
    const summary = summarizeOccupancyAudit(audit);
    return {
      status: 'ok',
      message:
        summary.mismatchCount === 0
          ? `No mismatches — ${summary.bedMapAssignedCount} assigned residents align with SSOT.`
          : `${summary.mismatchCount} mismatch(es): ${summary.residentsUnassignedCount} assigned on bed map but unassigned on Residents.`,
      audit,
      summary,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Occupancy audit failed.',
    };
  }
}

export async function rebuildOccupancyAction(
  _prev: OccupancyDiagnosticsActionState,
  _formData: FormData,
): Promise<OccupancyDiagnosticsActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    const result: OccupancyRebuildResult = await rebuildOccupancyState();
    revalidatePath('/admin/settings');
    return {
      status: 'ok',
      message: `Rebuild complete — ${result.orphanReservationsClosed} orphan reservation(s) closed, ${result.bookingsReconciled} booking(s) reconciled, ${result.residencyStatusSynced} residency flag(s) synced.`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Occupancy rebuild failed.',
    };
  }
}
