import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { PgResidentIndex } from '@/src/components/admin/modules/PgResidentIndex';
import {
  listAdminDepositSummaries,
  listAdminElectricityInvoicesForReminders,
  listAdminRentInvoices,
  listPgs,
} from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref, modulePgHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { paiseToInr } from '@/src/lib/format';
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
  await requireAdminSession('/admin/collections');

  const pgs = await listPgs();
  if (!pgs.ok) return <DbStatusBanner error={pgs.error} />;
  const pg = pgs.data.find((p) => p.id === pgId);
  if (!pg) notFound();

  const session = await requireAdminSession('/admin/revenue');
  const ctx = await loadOverviewContext(session, billingMonth, { syncActions: false });
  const pgMetrics = ctx.ok ? ctx.data.pgMetrics.find((m) => m.pgId === pgId) : null;

  const [rentRes, elecRes, depositRes] = await Promise.all([
    listAdminRentInvoices({ pgId }),
    listAdminElectricityInvoicesForReminders({ pgId }),
    listAdminDepositSummaries(),
  ]);

  const elecByPhone = new Map<string, number>();
  if (elecRes.ok) {
    for (const e of elecRes.data) {
      elecByPhone.set(e.customerPhone, (elecByPhone.get(e.customerPhone) ?? 0) + e.amountPaise);
    }
  }

  const depositByPhone = new Map<string, number>();
  if (depositRes.ok) {
    for (const d of depositRes.data.filter((x) => x.pgName === pg.name)) {
      depositByPhone.set(d.customerPhone, d.collectedPaise);
    }
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.collections.label, href: moduleHref('collections', billingMonth) },
          { label: pg.name },
        ]}
      />
      <PageHeader
        title={pg.name}
        description="Level 2 — PG collections summary and resident index."
        actions={
          <div className="flex gap-2">
            <OverviewMonthPicker billingMonth={billingMonth} />
            <Link
              href={`/admin/pgs/${pgId}/collections`}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-apg-silver hover:text-white"
            >
              PG settings →
            </Link>
          </div>
        }
      />

      {pgMetrics ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Rent', pgMetrics.incomeRentPaise],
            ['Electricity', pgMetrics.incomeElectricityPaise],
            ['Total in', pgMetrics.incomeTotalPaise],
            ['Occupancy', null],
          ].map(([label, paise]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
              <p className="text-[10px] uppercase text-apg-silver">{label}</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {label === 'Occupancy'
                  ? `${pgMetrics.occupancyPct}%`
                  : paiseToInr(paise as number)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {!rentRes.ok ? <DbStatusBanner error={rentRes.error} /> : null}

      <PgResidentIndex
        module="collections"
        pgId={pgId}
        billingMonth={billingMonth}
        pgName={pg.name}
        rentInvoices={rentRes.ok ? rentRes.data : []}
        electricityByPhone={elecByPhone}
        depositPaiseByPhone={depositByPhone}
      />
    </>
  );
}
