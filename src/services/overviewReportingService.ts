/**
 * Overview reporting SSOT composer — delegates to existing services only.
 * No SQL, filters, aggregations, or business rules in this module.
 */

import { getDashboardStats, listPgs, type DashboardStats } from '@/src/db/queries/admin';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { OPS_QUEUE_FILTERS, type OpsQueueFilter } from '@/src/lib/operations/operationsFilterLinks';
import type { AdminSession } from '@/src/lib/auth/session';
import { loadBillingCommandCenterSnapshot } from '@/src/services/billingCommandCenter';
import {
  computeOutstandingMoneyFromInvoices,
  loadInvoiceOutstandingSnapshot,
  loadRentInvoiceStats,
  type InvoiceOutstandingSnapshot,
  type OutstandingMoneyFromInvoices,
  type RentInvoiceStats,
} from '@/src/services/financialSummaryService';
import { getMoveOutPipelineSnapshot } from '@/src/services/moveOutPipelineService';
import { getUpcomingCheckinsCount } from '@/src/services/operationsCenter';
import { getRevenueCommandCenterData, type RevenueCommandCenterData } from '@/src/services/revenueCommandCenter';
import { getUnifiedOperationsQueueForRequest } from '@/src/services/unifiedOperationsQueue';
import { getActiveTenantCount, getVisitorCountSummary } from '@/src/services/visitorAnalytics';

export type OperationsQueueCounts = Record<OpsQueueFilter, number>;

export type OverviewReportingSnapshot = {
  billingMonth: string;
  monthLabel: string;
  invoiceSnapshot: InvoiceOutstandingSnapshot;
  invoiceOutstanding: OutstandingMoneyFromInvoices;
  rentStats: RentInvoiceStats | null;
  revenue: RevenueCommandCenterData;
  billingCenter: Awaited<ReturnType<typeof loadBillingCommandCenterSnapshot>>;
  operationsQueueCounts: OperationsQueueCounts;
  dashboard: DashboardStats | null;
  visitors: Awaited<ReturnType<typeof getVisitorCountSummary>>;
  activeTenants: number;
  upcomingCheckins: number;
  moveOutPipeline: Awaited<ReturnType<typeof getMoveOutPipelineSnapshot>>;
  pgCount: number;
};

const EMPTY_VISITORS = {
  today: 0,
  week: 0,
  month: 0,
  allTime: 0,
  uniqueToday: 0,
  uniqueWeek: 0,
  uniqueMonth: 0,
  uniqueAllTime: 0,
  returningToday: 0,
  returningWeek: 0,
  returningMonth: 0,
  returningAllTime: 0,
};

function queueCountsFromFilterCounts(
  filterCounts: Array<{ id: OpsQueueFilter; count: number }>,
): OperationsQueueCounts {
  const counts = Object.fromEntries(OPS_QUEUE_FILTERS.map((id) => [id, 0])) as OperationsQueueCounts;
  for (const row of filterCounts) {
    counts[row.id] = row.count;
  }
  return counts;
}

export async function loadOverviewReportingSnapshot(
  session: AdminSession,
  billingMonthInput?: string,
): Promise<OverviewReportingSnapshot> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  const invoiceSnapshot = await loadInvoiceOutstandingSnapshot(session);
  const invoiceOutstanding = computeOutstandingMoneyFromInvoices(invoiceSnapshot);

  const [
    rentStats,
    revenue,
    billingCenter,
    operationsQueue,
    dashboardResult,
    visitors,
    activeTenants,
    upcomingCheckins,
    moveOutPipeline,
    pgs,
  ] = await Promise.all([
    loadRentInvoiceStats(session, invoiceSnapshot).catch(() => null),
    getRevenueCommandCenterData({
      billingMonth,
      session,
      invoiceSnapshot,
    }),
    loadBillingCommandCenterSnapshot(session, billingMonth),
    getUnifiedOperationsQueueForRequest(session, null),
    getDashboardStats().catch(() => ({ ok: false as const, error: '' })),
    getVisitorCountSummary().catch((err) => {
      console.error('[overview] visitor analytics query failed', err);
      return EMPTY_VISITORS;
    }),
    getActiveTenantCount().catch(() => 0),
    getUpcomingCheckinsCount(session).catch(() => 0),
    getMoveOutPipelineSnapshot(session),
    listPgs().catch(() => ({ ok: false as const, error: '' })),
  ]);

  return {
    billingMonth,
    monthLabel,
    invoiceSnapshot,
    invoiceOutstanding,
    rentStats,
    revenue,
    billingCenter,
    operationsQueueCounts: queueCountsFromFilterCounts(operationsQueue.filterCounts),
    dashboard: dashboardResult.ok ? dashboardResult.data : null,
    visitors,
    activeTenants,
    upcomingCheckins,
    moveOutPipeline,
    pgCount: pgs.ok ? pgs.data.length : revenue.byPg.length,
  };
}
