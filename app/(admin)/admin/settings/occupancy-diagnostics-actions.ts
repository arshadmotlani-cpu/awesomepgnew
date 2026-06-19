'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  auditOccupancyMismatches,
  executeOccupancyRepair,
  previewOccupancyRepair,
  summarizeOccupancyAudit,
  type OccupancyAuditRow,
  type OccupancyRepairExecuteResult,
  type OccupancyRepairPreview,
} from '@/src/services/occupancyDiagnostics';

export type OccupancyDiagnosticsActionState =
  | { status: 'idle' }
  | {
      status: 'ok';
      message: string;
      audit?: OccupancyAuditRow[];
      summary?: ReturnType<typeof summarizeOccupancyAudit>;
      preview?: OccupancyRepairPreview;
      result?: OccupancyRepairExecuteResult;
    }
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
          : `${summary.mismatchCount} mismatch(es): ${summary.residentsUnassignedCount} assigned on bed map but unassigned on Residents; ${summary.occupiedTodayUnassignedCount} occupied today but unassigned.`,
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

export async function previewOccupancyDiagnosticsAction(
  _prev: OccupancyDiagnosticsActionState,
  _formData: FormData,
): Promise<OccupancyDiagnosticsActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    const preview = await previewOccupancyRepair(session);
    const r = preview.rebuild;
    return {
      status: 'ok',
      message: `Preview — mismatches ${preview.mismatchCountBefore}, bed audit issues ${preview.bedAuditIssueCount}. Would close ${r.orphanReservationsClosed} orphan reservation(s), reconcile ${r.bookingsReconciled} booking(s), sync ${r.residencyStatusSynced} residency flag(s), demote ${r.residencyStatusDemoted} stale active flag(s).`,
      preview,
      summary: preview.summary,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Occupancy preview failed.',
    };
  }
}

export async function executeOccupancyDiagnosticsAction(
  _prev: OccupancyDiagnosticsActionState,
  formData: FormData,
): Promise<OccupancyDiagnosticsActionState> {
  const session = await requireAdminSession('/admin/settings');
  const dryRun = formData.get('dryRun') === 'true';
  try {
    if (dryRun) {
      const preview = await previewOccupancyRepair(session);
      return {
        status: 'ok',
        message: `Dry run — ${preview.mismatchCountBefore} mismatch(es) would be addressed by rebuild (no writes).`,
        preview,
        summary: preview.summary,
      };
    }
    const result = await executeOccupancyRepair(session);
    revalidatePath('/admin/settings', 'layout');
    revalidatePath('/admin/residents', 'layout');
    revalidatePath('/admin/pgs', 'layout');
    revalidatePath('/admin/overview', 'layout');
    revalidatePath('/admin/operations', 'layout');
    return {
      status: 'ok',
      message: `Execute — mismatches ${result.mismatchCountBefore} → ${result.mismatchCountAfter} (repaired ${result.repairedCount}, remaining ${result.remainingCount}). Closed ${result.orphanReservationsClosed} orphan reservation(s), reconciled ${result.bookingsReconciled} booking(s). Bed audit issues ${result.bedAuditIssueCountBefore} → ${result.bedAuditIssueCountAfter}.`,
      result,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Occupancy repair failed.',
    };
  }
}

/** @deprecated Use executeOccupancyDiagnosticsAction with dryRun=false */
export async function rebuildOccupancyAction(
  _prev: OccupancyDiagnosticsActionState,
  _formData: FormData,
): Promise<OccupancyDiagnosticsActionState> {
  const formData = new FormData();
  formData.set('dryRun', 'false');
  return executeOccupancyDiagnosticsAction(_prev, formData);
}
