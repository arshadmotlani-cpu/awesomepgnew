import Link from 'next/link';
import { AdminOverviewKpiRow } from '@/src/components/admin/AdminOverviewKpiRow';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { BookingFunnelAnalyticsDashboard } from '@/src/components/admin/BookingFunnelAnalyticsDashboard';
import { OperationsCenter } from '@/src/components/admin/OperationsCenter';
import { RevenueCommandCenter } from '@/src/components/admin/RevenueCommandCenter';
import { SystemHealthCard } from '@/src/components/admin/SystemHealthCard';
import { VisitorAnalyticsDashboard } from '@/src/components/admin/VisitorAnalyticsDashboard';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import {
  OverviewFinancialPanels,
  PgBusinessMetricsTable,
} from '@/src/components/admin/PgBusinessMetricsTable';
import { PgIncomeDonutChart } from '@/src/components/admin/PgIncomeDonutChart';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { OverviewStatCard } from '@/src/components/admin/OverviewStatCard';
import { PageHeader } from '@/src/components/admin/PageHeader';
import {
  IconBuilding,
  IconCard,
  IconChart,
  IconUsers,
} from '@/src/components/admin/icons';
import { paiseToInr } from '@/src/lib/format';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { runOperatorTestDataCleanup } from '@/src/services/operatorTestDataCleanup';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getBusinessMetricsSummary,
  getPgBusinessMetrics,
  listPgs,
} from '@/src/db/queries/admin';
import {
  getAdminOverviewKpis,
  getVisitorCountSummary,
} from '@/src/services/visitorAnalytics';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import { getRevenueCommandCenterData } from '@/src/services/revenueCommandCenter';
import { getSentryDashboardUrl, getSystemHealthSnapshot } from '@/src/services/systemHealth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function DashboardPage({
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

  const session = await requireAdminSession('/admin');

  const [summary, metrics, pgs, visitors, overviewKpis, operationsCenter, systemHealth] =
    await Promise.all([
    getBusinessMetricsSummary(billingMonth),
    getPgBusinessMetrics(billingMonth),
    listPgs(),
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
    getSystemHealthSnapshot().catch(() => ({
      errorsToday: 0,
      errorsThisWeek: 0,
      lastCriticalError: null,
      uptimeStatus: 'healthy' as const,
    })),
  ]);

  const sentryUrl = getSentryDashboardUrl();

  if (!summary.ok) {
    return (
      <>
        <PageHeader title="Overview" description="PG operations at a glance." />
        <DbStatusBanner error={summary.error} />
        {!metrics.ok ? <DbStatusBanner error={metrics.error} /> : null}
      </>
    );
  }

  if (!metrics.ok) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Monthly collections, per-PG income, deposit refunds, and extra income from penalties."
          actions={<OverviewMonthPicker billingMonth={billingMonth} />}
        />
        <DbStatusBanner error={metrics.error} />
      </>
    );
  }

  const s = summary.data;
  const pgCount = pgs.ok ? pgs.data.length : 0;
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  const revenueCommandCenter = await getRevenueCommandCenterData({
    billingMonth,
    session,
    summary: s,
    pgMetrics: metrics.data,
    electricityPending: operationsCenter?.electricityPending,
  }).catch(() => null);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Monthly collections, per-PG income, deposit refunds, and extra income from penalties."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      {sp.extraIncomeCleared === '1' ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Removed June test deposit deductions
          {sp.removedPaise ? ` (₹${Number(sp.removedPaise) / 100})` : ''}. Extra income should
          now reflect only real charges.
        </div>
      ) : null}

      <div className="mb-6">
        {revenueCommandCenter ? (
          <AdminSectionErrorBoundary title="Revenue Command Center">
            <RevenueCommandCenter data={revenueCommandCenter} monthLabel={monthLabel} />
          </AdminSectionErrorBoundary>
        ) : null}
      </div>

      <div className="mb-6 space-y-6">
        {operationsCenter ? (
          <AdminSectionErrorBoundary title="Operations Center">
            <OperationsCenter data={operationsCenter} />
          </AdminSectionErrorBoundary>
        ) : null}
        <AdminOverviewKpiRow kpis={overviewKpis} visitors={visitors} />
        <AdminSectionErrorBoundary title="System health">
          <SystemHealthCard health={systemHealth} sentryUrl={sentryUrl} />
        </AdminSectionErrorBoundary>
        <AdminSectionErrorBoundary title="Website Analytics">
          <VisitorAnalyticsDashboard
            initialVisitors={visitors}
            billingMonth={billingMonth}
          />
        </AdminSectionErrorBoundary>
        <AdminSectionErrorBoundary title="Booking funnel">
          <BookingFunnelAnalyticsDashboard billingMonth={billingMonth} />
        </AdminSectionErrorBoundary>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <OverviewStatCard
          label="Rent collected"
          value={paiseToInr(s.incomeRentPaise)}
          hint={`QR ${paiseToInr(s.incomeRentQrPaise)} · Inv ${paiseToInr(s.incomeRentInvoicePaise)}`}
          icon={<IconCard />}
          accent="emerald"
        />
        <OverviewStatCard
          label="Electricity collected"
          value={paiseToInr(s.incomeElectricityPaise)}
          hint={`QR ${paiseToInr(s.incomeElectricityQrPaise)} · Inv ${paiseToInr(s.incomeElectricityInvoicePaise)}`}
          icon={<IconChart />}
          accent="sky"
        />
        <OverviewStatCard
          label="Total collected"
          value={paiseToInr(s.incomeTotalPaise)}
          hint={monthLabel}
          icon={<IconCard />}
          accent="indigo"
        />
        <OverviewStatCard
          label="Extra income"
          value={paiseToInr(s.extraIncomePaise)}
          hint="Vacating + charges + late fees"
          icon={<IconChart />}
          accent="orange"
        />
        <OverviewStatCard
          label="Deposit refunds"
          value={paiseToInr(s.depositRefundsPaise)}
          hint={`${s.depositRefundsCount} resident${s.depositRefundsCount === 1 ? '' : 's'} refunded`}
          icon={<IconCard />}
          accent="rose"
        />
        <OverviewStatCard
          label="Occupancy"
          value={`${s.occupancyPct}%`}
          hint={`${s.occupiedBeds}/${s.totalBeds} beds · exp ${paiseToInr(s.expectedMonthlyRentPaise)}/mo`}
          icon={<IconUsers />}
          accent="violet"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <PgIncomeDonutChart
            rows={metrics.data}
            totalPaise={s.incomeTotalPaise}
            monthLabel={monthLabel}
          />
        </div>
        <div className="xl:col-span-3">
          <OverviewFinancialPanels summary={s} />
        </div>
      </div>

      {metrics.data.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Breakdown by PG</h2>
            <p className="text-xs text-apg-silver">
              Collections, vacating profit, other charges, and deposit refunds for {monthLabel}.
            </p>
          </div>
          <PgBusinessMetricsTable rows={metrics.data} totals={s} />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/admin/pgs"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconBuilding className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">PG listings</p>
          <p className="mt-1 text-sm text-apg-silver">
            {pgCount} properties · rooms, rent, electricity, collections
          </p>
        </Link>
        <Link
          href="/admin/payments"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconCard className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">Collections</p>
          <p className="mt-1 text-sm text-apg-silver">Approve rent & electricity QR payments</p>
        </Link>
        <Link
          href="/admin/residents"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconUsers className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">Residents</p>
          <p className="mt-1 text-sm text-apg-silver">Monthly tenants & billing status</p>
        </Link>
      </div>
    </>
  );
}
