/**
 * Business analytics — occupancy, funnel, revenue MTD (not developer device metrics).
 */

import type { AdminSession } from '@/src/lib/auth/session';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { getBusinessMetricsSummary, getDashboardStats, getPgBusinessMetrics } from '@/src/db/queries/admin';
import { getExecutiveMetrics } from '@/src/services/executiveMetrics';
import { getRevenueCommandCenterData } from '@/src/services/revenueCommandCenter';
import { getVisitorCountSummary } from '@/src/services/visitorAnalytics';

export type BusinessAnalyticsSnapshot = {
  billingMonth: string;
  occupancyPct: number;
  occupiedBeds: number;
  totalBeds: number;
  revenueMtdPaise: number;
  rentMtdPaise: number;
  visitorsMonth: number;
  uniqueVisitorsMonth: number;
  activePgs: number;
  returningVisitorEstimate: number;
};

export async function loadBusinessAnalytics(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<BusinessAnalyticsSnapshot> {
  const billingMonth = resolveBillingMonth(billingMonthInput);

  const [summaryRes, metricsRes, visitors, dashboard, executive] = await Promise.all([
    getBusinessMetricsSummary(billingMonth),
    getPgBusinessMetrics(billingMonth),
    getVisitorCountSummary(),
    getDashboardStats().catch(() => ({ ok: false as const, error: '' })),
    getExecutiveMetrics(billingMonth).catch(() => null),
  ]);

  const summary = summaryRes.ok ? summaryRes.data : null;
  const pgMetrics = metricsRes.ok ? metricsRes.data : [];

  const revenue = summary
    ? await getRevenueCommandCenterData({
        session,
        billingMonth,
        summary,
        pgMetrics,
      }).catch(() => null)
    : null;

  const returningEstimate = Math.max(0, visitors.uniqueMonth - Math.floor(visitors.uniqueMonth * 0.3));

  return {
    billingMonth,
    occupancyPct: executive?.occupancyPct ?? summary?.occupancyPct ?? 0,
    occupiedBeds: executive?.occupiedBeds ?? summary?.occupiedBeds ?? 0,
    totalBeds: executive?.totalBeds ?? summary?.totalBeds ?? 0,
    revenueMtdPaise: revenue?.mtd.totalPaise ?? 0,
    rentMtdPaise: summary?.incomeRentPaise ?? 0,
    visitorsMonth: visitors.month,
    uniqueVisitorsMonth: visitors.uniqueMonth,
    activePgs: dashboard.ok ? dashboard.data.totalPgs : 0,
    returningVisitorEstimate: returningEstimate,
  };
}
