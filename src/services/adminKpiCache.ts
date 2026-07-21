/**
 * Cached admin dashboard KPI reads — overview / revenue aggregates only.
 * Does not cache payments queues, KYC, electricity bills, deposits, or check-ins.
 */
import {
  getBusinessMetricsSummary as getBusinessMetricsSummaryDb,
  getDashboardStats as getDashboardStatsDb,
  getPgBusinessMetrics as getPgBusinessMetricsDb,
  type BusinessMetricsSummary,
  type DashboardStats,
  type PgBusinessMetrics,
  type QueryResult,
} from '@/src/db/queries/admin';
import { cacheKeys, cacheTtl } from '@/src/lib/cache/keys';
import { cacheReadThrough } from '@/src/lib/cache/readThrough';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { getVisitorCountSummary as getVisitorCountSummaryDb } from '@/src/services/visitorAnalytics';

export function getCachedDashboardStats(): Promise<QueryResult<DashboardStats>> {
  return cacheReadThrough({
    key: cacheKeys.adminDashboardStats(),
    ttlSeconds: cacheTtl.adminDashboardStats,
    namespace: 'admin.dashboard_stats',
    fetch: () => getDashboardStatsDb(),
  });
}

export function getCachedBusinessMetricsSummary(
  billingMonthInput?: string,
): Promise<QueryResult<BusinessMetricsSummary>> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  return cacheReadThrough({
    key: cacheKeys.adminBusinessMetrics(billingMonth),
    ttlSeconds: cacheTtl.adminBusinessMetrics,
    namespace: 'admin.business_metrics',
    fetch: () => getBusinessMetricsSummaryDb(billingMonthInput),
  });
}

export function getCachedPgBusinessMetrics(
  billingMonthInput?: string,
): Promise<QueryResult<PgBusinessMetrics[]>> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  return cacheReadThrough({
    key: cacheKeys.adminPgBusinessMetrics(billingMonth),
    ttlSeconds: cacheTtl.adminBusinessMetrics,
    namespace: 'admin.pg_business_metrics',
    fetch: () => getPgBusinessMetricsDb(billingMonthInput),
  });
}

export async function getCachedVisitorCountSummary(): Promise<
  Awaited<ReturnType<typeof getVisitorCountSummaryDb>>
> {
  return cacheReadThrough({
    key: cacheKeys.adminVisitorSummary(),
    ttlSeconds: cacheTtl.adminVisitorSummary,
    namespace: 'admin.visitor_summary',
    fetch: () => getVisitorCountSummaryDb(),
  });
}
