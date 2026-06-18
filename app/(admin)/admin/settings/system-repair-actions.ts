'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  auditOccupancyMismatches,
  previewRebuildOccupancyState,
  rebuildOccupancyState,
  summarizeOccupancyAudit,
  type OccupancyAuditRow,
  type OccupancyRebuildResult,
} from '@/src/services/occupancyDiagnostics';
import {
  executeCheckoutSettlementRepair,
  previewCheckoutSettlementRepair,
  type CheckoutSettlementRepairPreview,
  type CheckoutSettlementRepairResult,
} from '@/src/services/checkoutSettlementRepair';
import {
  executeDashboardMetricsRepair,
  previewDashboardMetricsRepair,
  type DashboardMetricsRepairPreview,
  type DashboardMetricsRepairResult,
} from '@/src/services/dashboardMetricsRepair';
import {
  executeDepositRepair,
  previewDepositRepair,
  type DepositRepairPreview,
  type DepositRepairResult,
} from '@/src/services/depositRepair';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';

export type SystemRepairActionState =
  | { status: 'idle' }
  | {
      status: 'ok';
      message: string;
      preview?: unknown;
      result?: unknown;
    }
  | { status: 'error'; message: string };

function revalidateAllAdminViews() {
  revalidateFinancialViews();
  revalidatePath('/admin/settings', 'layout');
  revalidatePath('/admin/overview', 'layout');
  revalidatePath('/admin/residents', 'layout');
  revalidatePath('/admin/deposits', 'layout');
  revalidatePath('/admin/checkout-settlements', 'layout');
  revalidatePath('/admin/pgs', 'layout');
}

export async function previewOccupancyRepairAction(): Promise<SystemRepairActionState> {
  await requireAdminSession('/admin/settings');
  try {
    const preview = await previewRebuildOccupancyState();
    return {
      status: 'ok',
      message: `Dry run — would close ${preview.orphanReservationsClosed} orphan reservation(s), reconcile ${preview.bookingsReconciled} booking(s), sync ${preview.residencyStatusSynced} residency flag(s), demote ${preview.residencyStatusDemoted} stale active flag(s).`,
      preview,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Preview failed.' };
  }
}

export async function executeOccupancyRepairAction(): Promise<SystemRepairActionState> {
  await requireAdminSession('/admin/settings');
  try {
    const result: OccupancyRebuildResult = await rebuildOccupancyState();
    revalidateAllAdminViews();
    return {
      status: 'ok',
      message: `Repair complete — ${result.orphanReservationsClosed} orphan reservation(s) closed, ${result.bookingsReconciled} booking(s) reconciled, ${result.residencyStatusSynced} promoted, ${result.residencyStatusDemoted} demoted.`,
      result,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Repair failed.' };
  }
}

export async function auditOccupancyRepairAction(): Promise<SystemRepairActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    const audit: OccupancyAuditRow[] = await auditOccupancyMismatches(session);
    const summary = summarizeOccupancyAudit(audit);
    return {
      status: 'ok',
      message:
        summary.mismatchCount === 0
          ? `No mismatches — ${summary.bedMapAssignedCount} assigned residents align with SSOT.`
          : `${summary.mismatchCount} mismatch(es): ${summary.residentsUnassignedCount} assigned on bed map but unassigned on Residents.`,
      preview: { audit, summary },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Audit failed.' };
  }
}

export async function previewDepositRepairAction(): Promise<SystemRepairActionState> {
  await requireAdminSession('/admin/settings');
  try {
    const preview: DepositRepairPreview = await previewDepositRepair();
    return {
      status: 'ok',
      message: `Dry run — scanned ${preview.totalScanned} deposit booking(s); ${preview.issueCount} need sync.`,
      preview,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Preview failed.' };
  }
}

export async function executeDepositRepairAction(
  dryRun: boolean,
): Promise<SystemRepairActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    const result: DepositRepairResult = await executeDepositRepair({
      adminId: session.adminId,
      dryRun,
    });
    if (!dryRun) revalidateAllAdminViews();
    return {
      status: 'ok',
      message: dryRun
        ? `Dry run — would sync ${result.synced} booking(s), skip ${result.skipped}.`
        : `Repair complete — synced ${result.synced}, skipped ${result.skipped}, failed ${result.failed.length}.`,
      result,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Repair failed.' };
  }
}

export async function previewCheckoutRepairAction(): Promise<SystemRepairActionState> {
  await requireAdminSession('/admin/settings');
  try {
    const preview: CheckoutSettlementRepairPreview = await previewCheckoutSettlementRepair();
    return {
      status: 'ok',
      message: `Dry run — ${preview.rows.length} settlement issue(s): ${preview.orphanCount} orphan(s), ${preview.duplicateCount} duplicate(s).`,
      preview,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Preview failed.' };
  }
}

export async function executeCheckoutRepairAction(
  dryRun: boolean,
): Promise<SystemRepairActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    const result: CheckoutSettlementRepairResult = await executeCheckoutSettlementRepair({
      adminId: session.adminId,
      dryRun,
    });
    if (!dryRun) revalidateAllAdminViews();
    return {
      status: 'ok',
      message: dryRun
        ? `Dry run — would remove ${result.removed}, archive ${result.archived}, skip ${result.skipped}.`
        : `Repair complete — removed ${result.removed}, archived ${result.archived}, skipped ${result.skipped}, failed ${result.failed.length}.`,
      result,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Repair failed.' };
  }
}

export async function previewDashboardRepairAction(): Promise<SystemRepairActionState> {
  await requireAdminSession('/admin/settings');
  try {
    const preview: DashboardMetricsRepairPreview = await previewDashboardMetricsRepair();
    return {
      status: 'ok',
      message: `Dry run — dashboard occupied ${preview.dashboardOccupiedBeds} vs bed map ${preview.bedMapOccupiedTotal} (drift ${preview.occupancyDrift}). MTD revenue ₹${(preview.monthlyRevenuePaise / 100).toLocaleString('en-IN')}.`,
      preview,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Preview failed.' };
  }
}

export async function executeDashboardRepairAction(
  dryRun: boolean,
): Promise<SystemRepairActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    const result: DashboardMetricsRepairResult = await executeDashboardMetricsRepair({
      adminId: session.adminId,
      dryRun,
    });
    if (!dryRun) revalidateAllAdminViews();
    return {
      status: 'ok',
      message: dryRun
        ? `Dry run — occupancy drift ${result.occupancyDriftBefore}.`
        : `Repair complete — reconciled ${result.reconciledInvoices} financial row(s); occupancy drift ${result.occupancyDriftBefore} → ${result.occupancyDriftAfter}.`,
      result,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Repair failed.' };
  }
}
