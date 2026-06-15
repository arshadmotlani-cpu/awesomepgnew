import {
  getBusinessMetricsSummary,
  getDashboardStats,
  getDepositCollectedByPgForBillingMonth,
  getPgBusinessMetrics,
  getRentStats,
  listPgs,
  type BusinessMetricsSummary,
  type DashboardStats,
  type PgBusinessMetrics,
  type RentStats,
} from '@/src/db/queries/admin';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import type { AdminSession } from '@/src/lib/auth/session';
import { listOpenActionItems, syncActionItems } from '@/src/services/actionItems';
import {
  listAdminNotifications,
} from '@/src/services/adminNotifications';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import { getRevenueCommandCenterData } from '@/src/services/revenueCommandCenter';
import { getSentryDashboardUrl, getSystemHealthSnapshot } from '@/src/services/systemHealth';
import {
  getAdminOverviewKpis,
  getVisitorCountSummary,
} from '@/src/services/visitorAnalytics';

export type OverviewContext = {
  billingMonth: string;
  monthLabel: string;
  summary: BusinessMetricsSummary;
  pgMetrics: PgBusinessMetrics[];
  revenue: NonNullable<Awaited<ReturnType<typeof getRevenueCommandCenterData>>>;
  dashboard: DashboardStats | null;
  rentStats: RentStats | null;
  visitors: Awaited<ReturnType<typeof getVisitorCountSummary>>;
  overviewKpis: Awaited<ReturnType<typeof getAdminOverviewKpis>>;
  operations: Awaited<ReturnType<typeof getOperationsCenterData>> | null;
  actionItems: Awaited<ReturnType<typeof listOpenActionItems>>;
  systemHealth: Awaited<ReturnType<typeof getSystemHealthSnapshot>>;
  sentryUrl: string | null;
  pgCount: number;
  pendingActionsCount: number;
  unreadNotificationsCount: number;
  unreadNotifications: Awaited<ReturnType<typeof listAdminNotifications>>;
  vacatingAlertsCount: number;
};

export async function loadOverviewContext(
  session: AdminSession,
  billingMonthInput?: string,
  opts?: { syncActions?: boolean },
): Promise<
  | { ok: true; data: OverviewContext }
  | { ok: false; error: string; partial?: { billingMonth: string; monthLabel: string } }
> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  if (opts?.syncActions !== false) {
    await syncActionItems(session).catch(() => undefined);
  }

  const [
    summary,
    metrics,
    dashboard,
    rentStats,
    visitors,
    overviewKpis,
    operations,
    actionItems,
    depositRows,
    pgs,
    systemHealth,
  ] = await Promise.all([
    getBusinessMetricsSummary(billingMonth),
    getPgBusinessMetrics(billingMonth),
    getDashboardStats().catch(() => ({ ok: false as const, error: '' })),
    getRentStats().catch(() => ({ ok: false as const, error: '' })),
    getVisitorCountSummary().catch(() => ({
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
    })),
    getAdminOverviewKpis(billingMonth).catch(() => ({
      totalVisitorsAllTime: 0,
      activeTenants: 0,
      bedsOccupied: 0,
      bedsAvailable: 0,
      pendingKyc: 0,
      pendingPayments: 0,
      todayRevenuePaise: 0,
      monthlyRevenuePaise: 0,
    })),
    getOperationsCenterData(session).catch(() => null),
    listOpenActionItems(session).catch(() => []),
    getDepositCollectedByPgForBillingMonth(billingMonth).catch(() => ({
      ok: false as const,
      error: '',
    })),
    listPgs().catch(() => ({ ok: false as const, error: '' })),
    getSystemHealthSnapshot().catch(() => ({
      errorsToday: 0,
      errorsThisWeek: 0,
      lastCriticalError: null,
      uptimeStatus: 'healthy' as const,
    })),
  ]);

  if (!summary.ok) {
    return { ok: false, error: summary.error, partial: { billingMonth, monthLabel } };
  }
  if (!metrics.ok) {
    return { ok: false, error: metrics.error, partial: { billingMonth, monthLabel } };
  }

  const depositByPg = new Map<string, number>(
    depositRows.ok ? depositRows.data.map((r) => [r.pgId, r.collectedPaise]) : [],
  );

  const revenue = await getRevenueCommandCenterData({
    billingMonth,
    session,
    summary: summary.data,
    pgMetrics: metrics.data,
    electricityPending: operations?.electricityPending,
  }).catch(() => null);

  if (!revenue) {
    return { ok: false, error: 'Could not load revenue data.', partial: { billingMonth, monthLabel } };
  }

  void depositByPg; // reserved for future MTD deposit reconciliation per PG

  const pendingActionsCount = actionItems.length;
  const unreadNotifications = await listAdminNotifications(session, 'unread', 20).catch(() => []);
  const unreadNotificationsCount = unreadNotifications.length;
  const vacatingAlertsCount = operations?.leavingSoon.count ?? 0;

  return {
    ok: true,
    data: {
      billingMonth,
      monthLabel,
      summary: summary.data,
      pgMetrics: metrics.data,
      revenue,
      dashboard: dashboard.ok ? dashboard.data : null,
      rentStats: rentStats.ok ? rentStats.data : null,
      visitors,
      overviewKpis,
      operations,
      actionItems,
      systemHealth,
      sentryUrl: getSentryDashboardUrl(),
      pgCount: pgs.ok ? pgs.data.length : metrics.data.length,
      pendingActionsCount,
      unreadNotificationsCount,
      unreadNotifications,
      vacatingAlertsCount,
    },
  };
}
