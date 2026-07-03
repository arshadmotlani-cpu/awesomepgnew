import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { BookingFunnelAnalyticsDashboard } from '@/src/components/admin/BookingFunnelAnalyticsDashboard';
import { CouponAnalyticsPanel } from '@/src/components/admin/CouponAnalyticsPanel';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import {
  BusinessAnalyticsDashboard,
  BusinessAnalyticsOccupancyBar,
} from '@/src/components/admin/analytics/BusinessAnalyticsDashboard';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { loadBusinessAnalytics } from '@/src/services/businessAnalytics';
import { listDateCouponAnalytics } from '@/src/services/dateCouponAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AnalyticsModulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; legacy?: string }>;
}) {
  const billingMonth = resolveBillingMonth((await searchParams).month);
  const session = await requireAdminSession('/admin/analytics');
  const sp = await searchParams;
  const legacy = sp.legacy === '1';

  if (legacy) {
    const { loadOverviewContext } = await import('@/src/services/overviewData');
    const { VisitorAnalyticsDashboard } = await import('@/src/components/admin/VisitorAnalyticsDashboard');
    const { AdminOverviewKpiRow } = await import('@/src/components/admin/AdminOverviewKpiRow');
    const ctx = await loadOverviewContext(session, billingMonth, { syncActions: false });
    if (!ctx.ok) {
      return (
        <>
          <PageHeader title="Analytics (legacy)" />
          <DbStatusBanner error={ctx.error} />
        </>
      );
    }
    const { getAdminOverviewKpis } = await import('@/src/services/visitorAnalytics');
    const overviewKpis = await getAdminOverviewKpis(session, billingMonth);
    const couponAnalytics = await listDateCouponAnalytics(14);
    return (
      <>
        <PageHeader title="Analytics (legacy)" description="Full visitor device/browser tables." />
        <AdminOverviewKpiRow kpis={overviewKpis} visitors={ctx.data.visitors} />
        <VisitorAnalyticsDashboard initialVisitors={ctx.data.visitors} billingMonth={billingMonth} />
        <CouponAnalyticsPanel rows={couponAnalytics} />
      </>
    );
  }

  const business = await loadBusinessAnalytics(session, billingMonth);
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
        description="Business metrics — occupancy, revenue MTD, funnel, and coupons."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="space-y-8">
        <AdminSectionErrorBoundary title="Business KPIs">
          <BusinessAnalyticsDashboard data={business} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Occupancy">
          <BusinessAnalyticsOccupancyBar pct={business.occupancyPct} />
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
