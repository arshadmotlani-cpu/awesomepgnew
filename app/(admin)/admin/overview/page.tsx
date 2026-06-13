import { ControlBoard } from '@/src/components/admin/ControlBoard';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { SyncActionsButton } from '@/src/components/admin/SyncActionsButton';
import {
  getBusinessMetricsSummary,
  getDashboardStats,
  getDepositCollectedByPgForBillingMonth,
  getPgBusinessMetrics,
  getRentStats,
} from '@/src/db/queries/admin';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { runOperatorTestDataCleanup } from '@/src/services/operatorTestDataCleanup';
import { buildControlBoardData } from '@/src/services/controlBoard';
import { listOpenActionItems, syncActionItems } from '@/src/services/actionItems';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import { getRevenueCommandCenterData } from '@/src/services/revenueCommandCenter';
import {
  getAdminOverviewKpis,
  getVisitorCountSummary,
} from '@/src/services/visitorAnalytics';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    clearTestExtraIncome?: string;
    extraIncomeCleared?: string;
    removedPaise?: string;
  }>;
}) {
  const sp = await searchParams;

  if (sp.clearTestExtraIncome === '1') {
    await requireAdminSession('/admin/overview?clearTestExtraIncome=1');
    const result = await runOperatorTestDataCleanup();
    revalidatePath('/admin/overview');
    revalidatePath('/admin/deposits');
    const month = resolveBillingMonth(sp.month);
    redirect(
      `/admin/overview?month=${month}&extraIncomeCleared=1&removedPaise=${result.removedDeductionPaise}`,
    );
  }

  const billingMonth = resolveBillingMonth(sp.month);
  const session = await requireAdminSession('/admin/overview');

  await syncActionItems(session).catch(() => undefined);

  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  const [summary, metrics, dashboard, rentStats, visitors, overviewKpis, operationsCenter, actionItems, depositRows] =
    await Promise.all([
      getBusinessMetricsSummary(billingMonth),
      getPgBusinessMetrics(billingMonth),
      getDashboardStats().catch(() => null),
      getRentStats().catch(() => null),
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
      getDepositCollectedByPgForBillingMonth(billingMonth).catch(() => ({ ok: false as const, error: '' })),
    ]);

  if (!summary.ok) {
    return (
      <>
        <PageHeader title="Overview" description="Live operational control board." />
        <DbStatusBanner error={summary.error} />
      </>
    );
  }

  if (!metrics.ok) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Live operational control board."
          actions={<OverviewMonthPicker billingMonth={billingMonth} />}
        />
        <DbStatusBanner error={metrics.error} />
      </>
    );
  }

  const depositByPg = new Map<string, number>(
    depositRows.ok ? depositRows.data.map((r) => [r.pgId, r.collectedPaise]) : [],
  );

  const revenueCommandCenter = await getRevenueCommandCenterData({
    billingMonth,
    session,
    summary: summary.data,
    pgMetrics: metrics.data,
    electricityPending: operationsCenter?.electricityPending,
  }).catch(() => null);

  if (!revenueCommandCenter) {
    return (
      <>
        <PageHeader title="Overview" description="Live operational control board." />
        <DbStatusBanner error="Could not load revenue data." />
      </>
    );
  }

  const board = buildControlBoardData({
    billingMonth,
    monthLabel,
    summary: summary.data,
    pgMetrics: metrics.data,
    revenue: revenueCommandCenter,
    operations: operationsCenter,
    dashboard: dashboard?.ok ? dashboard.data : null,
    rentStats: rentStats?.ok ? rentStats.data : null,
    overviewKpis,
    visitors,
    actionItems,
    depositByPg,
  });

  return (
    <>
      <PageHeader
        title="Overview"
        description="Every metric is traceable to real people — click any card to drill down and act."
        actions={
          <div className="flex items-center gap-2">
            <SyncActionsButton />
            <OverviewMonthPicker billingMonth={billingMonth} />
          </div>
        }
      />

      {sp.extraIncomeCleared === '1' ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Removed June test deposit deductions
          {sp.removedPaise ? ` (₹${Number(sp.removedPaise) / 100})` : ''}. Extra income should
          now reflect only real charges.
        </div>
      ) : null}

      <ControlBoard
        cards={board.cards}
        billingMonth={board.billingMonth}
        monthLabel={board.monthLabel}
      />
    </>
  );
}
