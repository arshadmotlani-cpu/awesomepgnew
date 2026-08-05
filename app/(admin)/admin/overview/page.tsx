import { Suspense } from 'react';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { BillingCertificationNotice } from '@/src/components/admin/overview/BillingCertificationNotice';
import { OwnerDashboard } from '@/src/components/admin/overview/owner/OwnerDashboard';
import { OwnerDashboardWithTrends } from '@/src/components/admin/overview/owner/OwnerTrendChartsAsync';
import { OwnerLifeDashboard } from '@/src/components/admin/overview/owner/OwnerLifeDashboard';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { moduleHref } from '@/src/lib/admin/navigation';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';
import { loadOverviewContext } from '@/src/services/overviewData';
import { buildOwnerDashboard } from '@/src/services/ownerDashboard';
import {
  getOwnerLifeDashboard,
  isPersonalFinanceOsEnabled,
} from '@/src/personalFinance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function TrendsFallback({ data }: { data: ReturnType<typeof buildOwnerDashboard> }) {
  return <OwnerDashboard data={data} />;
}

export default async function OverviewPage() {
  const session = await requireAdminSession('/admin/overview');

  const lifeOsEnabled = isPersonalFinanceOsEnabled();
  const lifeOs = lifeOsEnabled
    ? await getOwnerLifeDashboard().catch((e) => {
        console.error('[overview] Owner OS failed', e);
        return null;
      })
    : null;

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

  if (!overviewResult.ok && !lifeOs) {
    return (
      <>
        <DbStatusBanner error={overviewResult.error} />
        <BillingCertificationNotice error={overviewResult.error} />
      </>
    );
  }

  const ctx = overviewResult.ok ? overviewResult.data : null;
  // Ecosystem health panel stays null until Repair Engine is shipped; do not
  // import uncommitted health modules here (breaks production builds).
  const baseData = ctx
    ? {
        ...buildOwnerDashboard(ctx, ctx.executiveMetrics),
        ecosystemHealth: null,
      }
    : null;

  return (
    <>
      <ModuleBreadcrumbs items={[{ label: 'Owner OS' }]} />
      <AdminSectionErrorBoundary title="Owner OS">
        {lifeOs ? <OwnerLifeDashboard finance={lifeOs.finance} /> : null}

        {billingCert.ok && billingCert.reconciliation ? (
          <div className="mt-8">
            <BillingCertificationNotice reconciliation={billingCert.reconciliation} />
          </div>
        ) : billingCert.error ? (
          <div className="mt-8">
            <BillingCertificationNotice error={billingCert.error} />
          </div>
        ) : null}

        {baseData && ctx ? (
          <div className="mt-10 space-y-4 border-t border-white/10 pt-8">
            <div>
              <h2 className="text-base font-semibold text-white">Awesome PG portfolio</h2>
              <p className="text-sm text-apg-silver">
                Engine-local PG overview (not Owner OS). Detail stays in Billing Centre.
              </p>
            </div>
            <Suspense fallback={<TrendsFallback data={baseData} />}>
              <OwnerDashboardWithTrends
                ctx={ctx}
                executive={ctx.executiveMetrics}
                baseData={baseData}
              />
            </Suspense>
          </div>
        ) : !overviewResult.ok ? (
          <div className="mt-8">
            <DbStatusBanner error={overviewResult.error} />
          </div>
        ) : null}

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
