import Link from 'next/link';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { OverviewFinancialPanels } from '@/src/components/admin/PgBusinessMetricsTable';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthNav } from '@/src/components/admin/OverviewMonthNav';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { PgIncomeDonutChart } from '@/src/components/admin/PgIncomeDonutChart';
import { RevenueCommandCenter } from '@/src/components/admin/RevenueCommandCenter';
import { RevenueLiveRefresh } from '@/src/components/admin/RevenueLiveRefresh';
import { RevenueMonthSummary } from '@/src/components/admin/RevenueMonthSummary';
import { DateCouponAdminPanel } from '@/src/components/admin/DateCouponAdminPanel';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref, modulePgHref } from '@/src/lib/admin/navigation';
import { isCurrentBillingMonth } from '@/src/lib/billing/monthNavigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { getDateCouponAdminSnapshot } from '@/src/services/dateCouponAdmin';
import { loadOverviewContext } from '@/src/services/overviewData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function RevenueModulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const session = await requireAdminSession('/admin/revenue');
  const ctx = await loadOverviewContext(session, billingMonth, { syncActions: false });

  if (!ctx.ok) {
    return (
      <>
        <PageHeader title="Revenue" />
        <DbStatusBanner error={ctx.error} />
      </>
    );
  }

  const { data } = ctx;
  const pgHref = (pgId: string) => modulePgHref('revenue', pgId, billingMonth);
  const couponSnapshot = await getDateCouponAdminSnapshot();
  const donutRows = data.revenue.byPg.map((row) => ({
    pgId: row.pgId,
    pgName: row.pgName,
    incomeTotalPaise: row.totalRevenuePaise,
  }));
  const donutTotal = data.revenue.mtd.totalPaise;

  return (
    <>
      <RevenueLiveRefresh billingMonth={billingMonth} />
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.revenue.label },
        ]}
      />
      <PageHeader
        title="Revenue"
        description={
          isCurrentBillingMonth(billingMonth)
            ? `Live month view · ${data.monthLabel}`
            : `Historical snapshot · ${data.monthLabel}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/revenue/billing?tab=billing"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-apg-silver hover:text-white"
            >
              Billing & collections →
            </Link>
            <OverviewMonthNav billingMonth={billingMonth} />
          </div>
        }
      />

      <div className="space-y-8">
        <RevenueMonthSummary
          billingMonth={billingMonth}
          summary={data.summary}
          revenue={data.revenue}
        />

        <DateCouponAdminPanel {...couponSnapshot} />

        <AdminSectionErrorBoundary title="Revenue command center">
          <RevenueCommandCenter data={data.revenue} monthLabel={data.monthLabel} pgHref={pgHref} />
        </AdminSectionErrorBoundary>

        <div className="grid gap-4 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <PgIncomeDonutChart
              rows={donutRows}
              totalPaise={donutTotal}
              monthLabel={data.monthLabel}
            />
          </div>
          <div className="xl:col-span-3">
            <OverviewFinancialPanels summary={data.summary} />
          </div>
        </div>
      </div>
    </>
  );
}
