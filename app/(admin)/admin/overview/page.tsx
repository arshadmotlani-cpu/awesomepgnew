import { Suspense } from 'react';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { BillingCertificationNotice } from '@/src/components/admin/overview/BillingCertificationNotice';
import { OwnerDashboard } from '@/src/components/admin/overview/owner/OwnerDashboard';
import { OwnerDashboardWithTrends } from '@/src/components/admin/overview/owner/OwnerTrendChartsAsync';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { moduleHref } from '@/src/lib/admin/navigation';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';
import { loadOverviewContext } from '@/src/services/overviewData';
import { buildOwnerDashboard } from '@/src/services/ownerDashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function TrendsFallback({ data }: { data: ReturnType<typeof buildOwnerDashboard> }) {
  return <OwnerDashboard data={data} />;
}

export default async function OverviewPage() {
  const session = await requireAdminSession('/admin/overview');

  const overviewResult = await profileAdminStep('overviewPage', () =>
    loadOverviewContext(session, undefined, { syncActions: false, reconcile: false }),
  );

  const billingCert = overviewResult.ok
    ? {
        ok: true as const,
        reconciliation: overviewResult.data.billingCenter.reconciliation,
        error: overviewResult.data.billingCenter.reconciliationError,
      }
    : { ok: false as const, error: overviewResult.error, reconciliation: null };

  if (!overviewResult.ok) {
    return (
      <>
        <DbStatusBanner error={overviewResult.error} />
        <BillingCertificationNotice error={overviewResult.error} />
      </>
    );
  }

  const ctx = overviewResult.data;
  const baseData = buildOwnerDashboard(ctx, ctx.executiveMetrics);

  return (
    <>
      <ModuleBreadcrumbs items={[{ label: 'Overview' }]} />
      <AdminSectionErrorBoundary title="Overview">
        {billingCert.ok && billingCert.reconciliation ? (
          <BillingCertificationNotice reconciliation={billingCert.reconciliation} />
        ) : billingCert.error ? (
          <BillingCertificationNotice error={billingCert.error} />
        ) : null}
        <Suspense fallback={<TrendsFallback data={baseData} />}>
          <OwnerDashboardWithTrends
            ctx={ctx}
            executive={ctx.executiveMetrics}
            baseData={baseData}
          />
        </Suspense>
        <p className="mt-8 text-sm text-apg-silver">
          Action items live in{' '}
          <a href={moduleHref('operations')} className="font-medium text-[#FF5A1F] hover:underline">
            Operations
          </a>
          . Financial detail is in{' '}
          <a href="/admin/billing" className="font-medium text-[#FF5A1F] hover:underline">
            Billing Centre
          </a>
          .
        </p>
      </AdminSectionErrorBoundary>
    </>
  );
}
