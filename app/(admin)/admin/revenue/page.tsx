import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import {
  OverviewFinancialPanels,
  PgBusinessMetricsTable,
} from '@/src/components/admin/PgBusinessMetricsTable';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { PgIncomeDonutChart } from '@/src/components/admin/PgIncomeDonutChart';
import { RevenueCommandCenter } from '@/src/components/admin/RevenueCommandCenter';
import { DateCouponAdminPanel } from '@/src/components/admin/DateCouponAdminPanel';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref, modulePgHref } from '@/src/lib/admin/navigation';
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

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.revenue.label },
        ]}
      />
      <PageHeader
        title="Revenue"
        description={`Rent, electricity, deposits, and PG-wise charts · ${data.monthLabel}`}
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="space-y-8">
        <DateCouponAdminPanel {...couponSnapshot} />

        <AdminSectionErrorBoundary title="Revenue command center">
          <RevenueCommandCenter data={data.revenue} monthLabel={data.monthLabel} pgHref={pgHref} />
        </AdminSectionErrorBoundary>

        <div className="grid gap-4 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <PgIncomeDonutChart
              rows={data.pgMetrics}
              totalPaise={data.summary.incomeTotalPaise}
              monthLabel={data.monthLabel}
            />
          </div>
          <div className="xl:col-span-3">
            <OverviewFinancialPanels summary={data.summary} />
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Revenue by PG</h2>
          <p className="text-xs text-apg-silver">Click a PG for resident index (level 2).</p>
          <PgBusinessMetricsTable rows={data.pgMetrics} totals={data.summary} pgHref={pgHref} />
        </section>
      </div>
    </>
  );
}
