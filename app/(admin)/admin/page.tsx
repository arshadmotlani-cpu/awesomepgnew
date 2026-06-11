import Link from 'next/link';
import { MarkCentralOccupiedButton } from '@/src/components/admin/MarkCentralOccupiedButton';
import { PgBusinessMetricsTable } from '@/src/components/admin/PgBusinessMetricsTable';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { StatCard } from '@/src/components/admin/StatCard';
import {
  IconBed,
  IconBuilding,
  IconCard,
  IconChart,
  IconUsers,
} from '@/src/components/admin/icons';
import { paiseToInr } from '@/src/lib/format';
import {
  getBusinessMetricsSummary,
  getPgBusinessMetrics,
  listPgs,
} from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [summary, metrics, pgs] = await Promise.all([
    getBusinessMetricsSummary(),
    getPgBusinessMetrics(),
    listPgs(),
  ]);

  if (!summary.ok) {
    return (
      <>
        <PageHeader title="Overview" description="PG operations at a glance." />
        <DbStatusBanner error={summary.error} />
      </>
    );
  }

  const s = summary.data;
  const pgCount = pgs.ok ? pgs.data.length : 0;
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <>
      <PageHeader
        title="Overview"
        description="Income and occupancy across all PGs — per property and business totals."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Collected this month"
          value={paiseToInr(s.incomeThisMonthPaise)}
          icon={<IconCard />}
          accent="emerald"
        />
        <StatCard
          label="Expected rent / month"
          value={paiseToInr(s.expectedMonthlyRentPaise)}
          icon={<IconChart />}
          accent="amber"
        />
        <StatCard
          label="Occupancy"
          value={`${s.occupancyPct}%`}
          icon={<IconUsers />}
          accent="rose"
        />
        <StatCard
          label="Beds occupied"
          value={`${s.occupiedBeds}/${s.totalBeds}`}
          icon={<IconBed />}
          accent="sky"
        />
      </div>

      <p className="text-xs text-zinc-500">
        Income for {monthLabel}: approved QR collections + paid rent and electricity invoices.
        Expected rent is the sum of monthly rates on beds occupied today.
      </p>

      <MarkCentralOccupiedButton />

      {metrics.ok && metrics.data.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">By PG</h2>
          <PgBusinessMetricsTable rows={metrics.data} />
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
