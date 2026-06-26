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
import { listOpenActionItems, listOldestPendingActionItems, syncActionItems } from '@/src/services/actionItems';
import { listAdminInboxNotifications } from '@/src/services/notificationEngine';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import { getRevenueCommandCenterData } from '@/src/services/revenueCommandCenter';
import { getSentryDashboardUrl, getSystemHealthSnapshot } from '@/src/services/systemHealth';
import {
  getAdminOverviewKpis,
  getVisitorCountSummary,
} from '@/src/services/visitorAnalytics';
import type { GlobalFinancialAggregates } from '@/src/lib/billing/residentFinancialTypes';
import type { DepositPortfolioMetrics } from '@/src/services/depositLedgerMetrics';

export type OverviewContext = {
  billingMonth: string;
  monthLabel: string;
  summary: BusinessMetricsSummary;
  pgMetrics: PgBusinessMetrics[];
  revenue: NonNullable<Awaited<ReturnType<typeof getRevenueCommandCenterData>>>;
  depositPortfolio: DepositPortfolioMetrics;
  financialAggregates: GlobalFinancialAggregates;
  dashboard: DashboardStats | null;
  rentStats: RentStats | null;
  visitors: Awaited<ReturnType<typeof getVisitorCountSummary>>;
  overviewKpis: Awaited<ReturnType<typeof getAdminOverviewKpis>>;
  operations: Awaited<ReturnType<typeof getOperationsCenterData>> | null;
  actionItems: Awaited<ReturnType<typeof listOpenActionItems>>;
  oldestPendingActions: Awaited<ReturnType<typeof listOldestPendingActionItems>>;
  systemHealth: Awaited<ReturnType<typeof getSystemHealthSnapshot>>;
  sentryUrl: string | null;
  pgCount: number;
  pendingActionsCount: number;
  unreadNotificationsCount: number;
  unreadNotifications: Awaited<ReturnType<typeof listAdminInboxNotifications>>;
  vacatingAlertsCount: number;
  outstandingDeposits: Awaited<ReturnType<typeof import('@/src/services/depositCollection').listOutstandingDeposits>>;
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

  if (opts?.syncActions === true) {
    await syncActionItems(session).catch(() => undefined);
    const { reconcileStaleFinancialInvoices } = await import('@/src/lib/billing/financialMetrics');
    await reconcileStaleFinancialInvoices({ billingMonth }).catch(() => undefined);
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
    getVisitorCountSummary().catch((err) => {
      console.error('[overview] visitor analytics query failed', err);
      return {
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
    }),
    getAdminOverviewKpis(session, billingMonth).catch(() => ({
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

  const { getGlobalFinancialAggregates } = await import('@/src/services/residentFinancialEngine');
  const { getDepositPortfolioMetrics } = await import('@/src/services/depositLedgerMetrics');
  const [financialAggregates, depositPortfolio] = await Promise.all([
    getGlobalFinancialAggregates(session).catch(() => ({
      asOf: new Date().toISOString(),
      rent: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
      deposit: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
      electricity: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
      other: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
      totals: { requiredPaise: 0, paidPaise: 0, outstandingPaise: 0 },
      pendingRentInvoiceCount: 0,
      pendingElectricityInvoiceCount: 0,
    })),
    getDepositPortfolioMetrics(billingMonth).catch(() => ({
      billingMonth,
      collectedAllTimePaise: 0,
      collectedMtdPaise: 0,
      heldPaise: 0,
      refundedAllTimePaise: 0,
      refundedMtdPaise: 0,
      residentDeductionsPaise: 0,
    })),
  ]);

  void depositByPg; // reserved for future MTD deposit reconciliation per PG

  const pendingActionsCount = actionItems.length;
  const oldestPendingActions = await listOldestPendingActionItems(session, 5).catch(() => []);
  const unreadNotifications = await listAdminInboxNotifications(session, 'unread', 20).catch(() => []);
  const unreadNotificationsCount = unreadNotifications.length;
  const vacatingAlertsCount = operations?.leavingSoon.count ?? 0;
  const { listOutstandingDeposits } = await import('@/src/services/depositCollection');
  const outstandingDeposits = await listOutstandingDeposits().catch(() => []);

  return {
    ok: true,
    data: {
      billingMonth,
      monthLabel,
      summary: summary.data,
      pgMetrics: metrics.data,
      revenue,
      depositPortfolio,
      financialAggregates,
      dashboard: dashboard.ok ? dashboard.data : null,
      rentStats: rentStats.ok ? rentStats.data : null,
      visitors,
      overviewKpis,
      operations,
      actionItems,
      oldestPendingActions,
      systemHealth,
      sentryUrl: getSentryDashboardUrl(),
      pgCount: pgs.ok ? pgs.data.length : metrics.data.length,
      pendingActionsCount,
      unreadNotificationsCount,
      unreadNotifications,
      vacatingAlertsCount,
      outstandingDeposits,
    },
  };
}
