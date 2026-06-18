/**
 * Dashboard metrics repair — reconcile financial mirrors and refresh caches.
 */

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { auditLog, beds } from '@/src/db/schema';
import { db } from '@/src/db/client';
import { reconcileStaleFinancialInvoices } from '@/src/lib/billing/financialMetrics';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { bedOccupiedTodayExistsSql } from '@/src/lib/occupancySsot';
import { getDashboardStats } from '@/src/db/queries/admin';
import { getMonthlyRevenuePaise } from '@/src/services/dashboardMetrics';

export type DashboardMetricsRepairPreview = {
  billingMonth: string;
  dashboardOccupiedBeds: number;
  bedMapOccupiedTotal: number;
  occupancyDrift: number;
  monthlyRevenuePaise: number;
  rentAndElectricityPaise: number;
  depositPaise: number;
};

export type DashboardMetricsRepairResult = {
  reconciledInvoices: number;
  occupancyDriftBefore: number;
  occupancyDriftAfter: number;
};

export async function previewDashboardMetricsRepair(
  billingMonthInput?: string,
): Promise<DashboardMetricsRepairPreview> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const [dash, revenue, ssotOcc] = await Promise.all([
    getDashboardStats(),
    getMonthlyRevenuePaise(billingMonth),
    db
      .select({ count: sql<number>`count(distinct ${beds.id})::int` })
      .from(beds)
      .where(sql`${beds.archivedAt} IS NULL AND ${bedOccupiedTodayExistsSql}`),
  ]);

  const dashboardOccupiedBeds = dash.ok ? dash.data.occupiedBeds : 0;
  const bedMapOccupiedTotal = ssotOcc[0]?.count ?? 0;

  return {
    billingMonth,
    dashboardOccupiedBeds,
    bedMapOccupiedTotal,
    occupancyDrift: Math.abs(dashboardOccupiedBeds - bedMapOccupiedTotal),
    monthlyRevenuePaise: revenue.totalPaise,
    rentAndElectricityPaise: revenue.rentAndElectricityPaise,
    depositPaise: revenue.depositPaise,
  };
}

export async function executeDashboardMetricsRepair(input: {
  adminId: string;
  billingMonth?: string;
  dryRun?: boolean;
}): Promise<DashboardMetricsRepairResult> {
  const billingMonth = resolveBillingMonth(input.billingMonth);
  const before = await previewDashboardMetricsRepair(billingMonth);

  if (input.dryRun) {
    return {
      reconciledInvoices: 0,
      occupancyDriftBefore: before.occupancyDrift,
      occupancyDriftAfter: before.occupancyDrift,
    };
  }

  const reconciled = await reconcileStaleFinancialInvoices({ billingMonth });
  const reconciledCount =
    reconciled.financialRowsFixed +
    reconciled.financialRowsCancelled +
    reconciled.rentUnifiedSynced +
    reconciled.elecUnifiedSynced;

  const after = await previewDashboardMetricsRepair(billingMonth);

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'system',
    entityId: input.adminId,
    action: 'dashboard_metrics_repair_executed',
    diff: {
      billingMonth,
      reconciledInvoices: reconciledCount,
      occupancyDriftBefore: before.occupancyDrift,
      occupancyDriftAfter: after.occupancyDrift,
    },
  });

  revalidatePath('/admin/overview', 'layout');
  revalidatePath('/admin/revenue', 'layout');
  revalidatePath('/admin/analytics', 'layout');
  revalidatePath('/admin/operations', 'layout');

  return {
    reconciledInvoices: reconciledCount,
    occupancyDriftBefore: before.occupancyDrift,
    occupancyDriftAfter: after.occupancyDrift,
  };
}
