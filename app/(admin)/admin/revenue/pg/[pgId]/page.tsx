import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthNav } from '@/src/components/admin/OverviewMonthNav';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { PgRevenueResidentTable } from '@/src/components/admin/PgRevenueResidentTable';
import { RevenueLiveRefresh } from '@/src/components/admin/RevenueLiveRefresh';
import { listPgs } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { formatBillingMonthLabel } from '@/src/lib/billing/monthNavigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { paiseToInr } from '@/src/lib/format';
import { getPgDepositCollectionDetail } from '@/src/services/pgDepositCollection';
import { getPgRevenueResidentRows } from '@/src/services/pgRevenueResidents';
import { loadOverviewContext } from '@/src/services/overviewData';

export const dynamic = 'force-dynamic';

export default async function RevenuePgPage({
  params,
  searchParams,
}: {
  params: Promise<{ pgId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { pgId } = await params;
  const billingMonth = resolveBillingMonth((await searchParams).month);
  const monthLabel = formatBillingMonthLabel(billingMonth);
  await requireAdminSession('/admin/revenue');

  const pgs = await listPgs();
  if (!pgs.ok) return <DbStatusBanner error={pgs.error} />;
  const pg = pgs.data.find((p) => p.id === pgId);
  if (!pg) notFound();

  const session = await requireAdminSession('/admin/revenue');
  const [ctx, depositDetail, residentRows] = await Promise.all([
    loadOverviewContext(session, billingMonth, { syncActions: false }),
    getPgDepositCollectionDetail(pgId, billingMonth),
    getPgRevenueResidentRows(pgId, billingMonth),
  ]);

  const pgRow = ctx.ok ? ctx.data.revenue.byPg.find((m) => m.pgId === pgId) : null;

  return (
    <>
      <RevenueLiveRefresh billingMonth={billingMonth} />
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.revenue.label, href: `/admin/revenue?month=${billingMonth.slice(0, 7)}` },
          { label: pg.name },
        ]}
      />
      <PageHeader
        title={pg.name}
        description={`Collection breakdown · ${monthLabel}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <OverviewMonthNav billingMonth={billingMonth} />
            <Link
              href={`/admin/deposits/collected?pgId=${pgId}&month=${billingMonth}`}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
            >
              Deposit details →
            </Link>
          </div>
        }
      />

      {pgRow ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {[
            ['Occupancy', `${pgRow.occupancyPct}% · ${pgRow.occupiedBeds}/${pgRow.totalBeds}`],
            ['Rent revenue', paiseToInr(pgRow.rentRevenuePaise)],
            ['Electricity', paiseToInr(pgRow.electricityRevenuePaise)],
            ['Deposit revenue', paiseToInr(pgRow.depositRevenuePaise)],
            ['Late fees', paiseToInr(pgRow.lateFeePaise)],
            ['Total revenue', paiseToInr(pgRow.totalRevenuePaise)],
            [
              'Deposits',
              depositDetail
                ? `${depositDetail.stats.depositPaidCount} paid · ${depositDetail.stats.depositPendingCount} pending · ${depositDetail.stats.depositRequirementMissingCount} missing req.`
                : '—',
            ],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
              <p className="text-[10px] uppercase text-apg-silver">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{val}</p>
            </div>
          ))}
        </div>
      ) : null}

      <PgRevenueResidentTable rows={residentRows} billingMonth={billingMonth} pgId={pgId} />
    </>
  );
}
