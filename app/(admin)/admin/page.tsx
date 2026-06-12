import Link from 'next/link';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import {
  OverviewFinancialPanels,
  PgBusinessMetricsTable,
} from '@/src/components/admin/PgBusinessMetricsTable';
import { buildDonutSlices, PgIncomeDonutChart } from '@/src/components/admin/PgIncomeDonutChart';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { OverviewStatCard } from '@/src/components/admin/OverviewStatCard';
import { PageHeader } from '@/src/components/admin/PageHeader';
import {
  IconBuilding,
  IconCard,
  IconChart,
  IconUsers,
} from '@/src/components/admin/icons';
import { paiseToInr } from '@/src/lib/format';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  getBusinessMetricsSummary,
  getPgBusinessMetrics,
  listPgs,
} from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  try {
    return await DashboardPageContent({ searchParams });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin/overview] render failed:', message);
    return (
      <>
        <PageHeader title="Overview" description="PG operations at a glance." />
        <DbStatusBanner error={message} />
      </>
    );
  }
}

async function DashboardPageContent({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);

  const [summary, metrics, pgs] = await Promise.all([
    getBusinessMetricsSummary(billingMonth),
    getPgBusinessMetrics(billingMonth),
    listPgs(),
  ]);

  if (!summary.ok) {
    return (
      <>
        <PageHeader title="Overview" description="PG operations at a glance." />
        <DbStatusBanner error={summary.error} />
        {!metrics.ok ? <DbStatusBanner error={metrics.error} /> : null}
      </>
    );
  }

  if (!metrics.ok) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Monthly collections, per-PG income, deposit refunds, and extra income from penalties."
          actions={<OverviewMonthPicker billingMonth={billingMonth} />}
        />
        <DbStatusBanner error={metrics.error} />
      </>
    );
  }

  const s = summary.data;
  const pgCount = pgs.ok ? pgs.data.length : 0;
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  const donutSlices = metrics.data.length > 0 ? buildDonutSlices(metrics.data) : [];

  return (
    <>
      <PageHeader
        title="Overview"
        description="Monthly collections, per-PG income, deposit refunds, and extra income from penalties."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <OverviewStatCard
          label="Rent collected"
          value={paiseToInr(s.incomeRentPaise)}
          hint={`QR ${paiseToInr(s.incomeRentQrPaise)} · Inv ${paiseToInr(s.incomeRentInvoicePaise)}`}
          icon={<IconCard />}
          accent="emerald"
        />
        <OverviewStatCard
          label="Electricity collected"
          value={paiseToInr(s.incomeElectricityPaise)}
          hint={`QR ${paiseToInr(s.incomeElectricityQrPaise)} · Inv ${paiseToInr(s.incomeElectricityInvoicePaise)}`}
          icon={<IconChart />}
          accent="sky"
        />
        <OverviewStatCard
          label="Total collected"
          value={paiseToInr(s.incomeTotalPaise)}
          hint={monthLabel}
          icon={<IconCard />}
          accent="indigo"
        />
        <OverviewStatCard
          label="Extra income"
          value={paiseToInr(s.extraIncomePaise)}
          hint="Vacating + charges + late fees"
          icon={<IconChart />}
          accent="orange"
        />
        <OverviewStatCard
          label="Deposit refunds"
          value={paiseToInr(s.depositRefundsPaise)}
          hint={`${s.depositRefundsCount} resident${s.depositRefundsCount === 1 ? '' : 's'} refunded`}
          icon={<IconCard />}
          accent="rose"
        />
        <OverviewStatCard
          label="Occupancy"
          value={`${s.occupancyPct}%`}
          hint={`${s.occupiedBeds}/${s.totalBeds} beds · exp ${paiseToInr(s.expectedMonthlyRentPaise)}/mo`}
          icon={<IconUsers />}
          accent="violet"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <PgIncomeDonutChart
            slices={donutSlices}
            totalPaise={s.incomeTotalPaise}
            monthLabel={monthLabel}
          />
        </div>
        <div className="xl:col-span-3">
          <OverviewFinancialPanels summary={s} />
        </div>
      </div>

      {metrics.data.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Breakdown by PG</h2>
            <p className="text-xs text-apg-silver">
              Collections, vacating profit, other charges, and deposit refunds for {monthLabel}.
            </p>
          </div>
          <PgBusinessMetricsTable rows={metrics.data} totals={s} />
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/admin/pgs"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconBuilding className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">PG listings</p>
          <p className="mt-1 text-sm text-apg-silver">
            {pgCount} properties · rooms, rent, electricity, collections
          </p>
        </Link>
        <Link
          href="/admin/payments"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconCard className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">Collections</p>
          <p className="mt-1 text-sm text-apg-silver">Approve rent & electricity QR payments</p>
        </Link>
        <Link
          href="/admin/residents"
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-5 transition hover:border-[#FF5A1F]/40"
        >
          <IconUsers className="text-[#FF5A1F]" width={24} height={24} />
          <p className="mt-3 font-semibold text-white">Residents</p>
          <p className="mt-1 text-sm text-apg-silver">Monthly tenants & billing status</p>
        </Link>
      </div>
    </>
  );
}
