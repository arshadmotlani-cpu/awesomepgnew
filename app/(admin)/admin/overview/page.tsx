import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { OverviewDashboard } from '@/src/components/admin/overview/OverviewDashboard';
import { BillingCertificationNotice } from '@/src/components/admin/overview/BillingCertificationNotice';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { moduleHref } from '@/src/lib/admin/navigation';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { loadOverviewContext } from '@/src/services/overviewData';
import { loadBillingReconciliationSafe } from '@/src/services/billingCycleReconciliation';
import { buildOverviewDashboard } from '@/src/services/overviewDashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OverviewPage() {
  const session = await requireAdminSession('/admin/overview');

  const [overviewResult, billingCert] = await Promise.all([
    loadOverviewContext(session, undefined, { syncActions: true }),
    loadBillingReconciliationSafe(session),
  ]);

  if (!overviewResult.ok) {
    return (
      <>
        <DbStatusBanner error={overviewResult.error} />
        {billingCert.ok ? (
          <BillingCertificationNotice reconciliation={billingCert.reconciliation} />
        ) : (
          <BillingCertificationNotice error={billingCert.error} />
        )}
      </>
    );
  }

  const dashboard = buildOverviewDashboard(overviewResult.data);

  return (
    <>
      <ModuleBreadcrumbs items={[{ label: 'Overview' }]} />
      <AdminSectionErrorBoundary title="Overview">
        {billingCert.ok ? (
          <BillingCertificationNotice reconciliation={billingCert.reconciliation} />
        ) : (
          <BillingCertificationNotice error={billingCert.error} />
        )}
        <OverviewDashboard data={dashboard} />
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
