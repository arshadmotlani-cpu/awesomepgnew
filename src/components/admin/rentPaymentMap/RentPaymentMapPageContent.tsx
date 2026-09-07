import { Suspense } from 'react';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { RentPaymentMapFilters } from '@/src/components/admin/invoices/RentPaymentMapFilters';
import { RentPaymentMapPanel } from '@/src/components/admin/invoices/RentPaymentMapPanel';
import { RentPaymentMapSummaryStrip } from '@/src/components/admin/invoices/RentPaymentMapSummaryStrip';
import { listPgs } from '@/src/db/queries/admin';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { formatBillingMonthLabel } from '@/src/lib/billing/monthNavigation';
import { loadRentPaymentMap } from '@/src/services/rentPaymentMap';

export type RentPaymentMapBreadcrumb = { label: string; href?: string };

export async function RentPaymentMapPageContent({
  sessionPath,
  breadcrumbs,
  searchParams,
}: {
  sessionPath: string;
  breadcrumbs: RentPaymentMapBreadcrumb[];
  searchParams: Promise<{ month?: string; pg?: string }>;
}) {
  const session = await requireAdminSession(sessionPath);
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const selectedPgId = sp.pg?.trim() || undefined;

  const [data, pgsResult] = await Promise.all([
    loadRentPaymentMap(session, { billingMonth, pgId: selectedPgId }),
    listPgs(),
  ]);

  const pgs =
    pgsResult.ok
      ? pgsResult.data
          .filter((pg) =>
            adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pg.id),
          )
          .map((pg) => ({ id: pg.id, name: pg.name }))
      : [];

  const monthLabel = formatBillingMonthLabel(billingMonth);

  return (
    <>
      <ModuleBreadcrumbs items={breadcrumbs} />
      <PageHeader
        title="Rent Payment Map"
        description={`Operational rent collection map by bed — ${monthLabel}.`}
        actions={
          <Suspense fallback={null}>
            <RentPaymentMapFilters
              pgs={pgs}
              billingMonth={billingMonth}
              selectedPgId={selectedPgId}
            />
          </Suspense>
        }
      />

      <RentPaymentMapSummaryStrip summary={data.summary} />
      <RentPaymentMapPanel data={data} />
    </>
  );
}
