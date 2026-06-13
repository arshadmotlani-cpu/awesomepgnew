import { AdminOverviewKpiRow } from '@/src/components/admin/AdminOverviewKpiRow';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { BookingFunnelAnalyticsDashboard } from '@/src/components/admin/BookingFunnelAnalyticsDashboard';
import { CouponAnalyticsPanel } from '@/src/components/admin/CouponAnalyticsPanel';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { VisitorAnalyticsDashboard } from '@/src/components/admin/VisitorAnalyticsDashboard';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { listDateCouponAnalytics } from '@/src/services/dateCouponAdmin';
import { loadOverviewContext } from '@/src/services/overviewData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AnalyticsModulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const billingMonth = resolveBillingMonth((await searchParams).month);
  const session = await requireAdminSession('/admin/analytics');
  const ctx = await loadOverviewContext(session, billingMonth, { syncActions: false });

  if (!ctx.ok) {
    return (
      <>
        <PageHeader title="Analytics" />
        <DbStatusBanner error={ctx.error} />
      </>
    );
  }

  const { data } = ctx;
  const couponAnalytics = await listDateCouponAnalytics(14);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.analytics.label },
        ]}
      />
      <PageHeader
        title="Analytics"
        description="Visitors, traffic sources, devices, locations, and booking funnel — no finance data."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="space-y-8">
        <AdminSectionErrorBoundary title="Visitor KPIs">
          <AdminOverviewKpiRow kpis={data.overviewKpis} visitors={data.visitors} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Website analytics">
          <VisitorAnalyticsDashboard initialVisitors={data.visitors} billingMonth={billingMonth} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Booking funnel">
          <BookingFunnelAnalyticsDashboard billingMonth={billingMonth} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Coupon analytics">
          <CouponAnalyticsPanel rows={couponAnalytics} />
        </AdminSectionErrorBoundary>
      </div>
    </>
  );
}
