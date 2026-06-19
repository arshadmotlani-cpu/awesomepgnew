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
  const session = await requireAdminSession('/admin/settings');
  try {
    const preview: OccupancyRepairPreview = await previewOccupancyRepair(session);
    const r = preview.rebuild;
    return {
      status: 'ok',
      message: `Preview — mismatches ${preview.mismatchCountBefore}, bed audit issues ${preview.bedAuditIssueCount}. Would close ${r.orphanReservationsClosed} orphan reservation(s), reconcile ${r.bookingsReconciled} booking(s), sync ${r.residencyStatusSynced} residency flag(s), demote ${r.residencyStatusDemoted} stale active flag(s).`,
      preview,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Preview failed.' };
  }
}

export async function executeOccupancyRepairAction(
  dryRun = false,
): Promise<SystemRepairActionState> {
  const session = await requireAdminSession('/admin/settings');
  try {
    if (dryRun) {
      const preview = await previewOccupancyRepair(session);
      return {
        status: 'ok',
        message: `Dry run — ${preview.mismatchCountBefore} mismatch(es) would be addressed by rebuild (no writes).`,
        preview,
      };
    }
    const result: OccupancyRepairExecuteResult = await executeOccupancyRepair(session);
    revalidateAllAdminViews();
    return {
      status: 'ok',
      message: `Execute — mismatches ${result.mismatchCountBefore} → ${result.mismatchCountAfter} (repaired ${result.repairedCount}, remaining ${result.remainingCount}). Closed ${result.orphanReservationsClosed} orphan reservation(s), reconciled ${result.bookingsReconciled} booking(s), synced ${result.residencyStatusSynced} residency flag(s), demoted ${result.residencyStatusDemoted}. Bed audit issues ${result.bedAuditIssueCountBefore} → ${result.bedAuditIssueCountAfter}.`,
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
      message: `Preview — ${preview.issueCount} issue(s): ${preview.orphanCount} orphan(s), ${preview.duplicateCount} booking duplicate(s), ${preview.duplicateVacatingCount} vacating duplicate(s), ${preview.archivedOnActiveCount} archived-on-active.`,
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
        ? `Dry run — would remove ${result.removed}, archive ${result.archived}, rebuild ${result.rebuilt}, skip ${result.skipped}. Issues ${result.issueCountBefore} → ${result.issueCountAfter}.`
        : `Execute — issues ${result.issueCountBefore} → ${result.issueCountAfter} (repaired ${result.repairedCount}, remaining ${result.remainingCount}). Removed ${result.removed}, archived ${result.archived}, rebuilt ${result.rebuilt}, skipped ${result.skipped}, failed ${result.failed.length}.`,
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
