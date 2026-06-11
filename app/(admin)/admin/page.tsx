import Link from 'next/link';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
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
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  getBusinessMetricsSummary,
  getPgBusinessMetrics,
  listPgs,
} from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
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

  return (
    <>
      <PageHeader
        title="Overview"
        description="Monthly collection report — rent and electricity, per PG and business totals."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Rent collected"
          value={paiseToInr(s.incomeRentPaise)}
          hint={`QR ${paiseToInr(s.incomeRentQrPaise)} · Invoice ${paiseToInr(s.incomeRentInvoicePaise)}`}
          icon={<IconCard />}
          accent="emerald"
        />
        <StatCard
          label="Electricity collected"
          value={paiseToInr(s.incomeElectricityPaise)}
          hint={`QR ${paiseToInr(s.incomeElectricityQrPaise)} · Invoice ${paiseToInr(s.incomeElectricityInvoicePaise)}`}
          icon={<IconChart />}
          accent="sky"
        />
        <StatCard
          label="Total collected"
          value={paiseToInr(s.incomeTotalPaise)}
          hint={monthLabel}
          icon={<IconCard />}
          accent="indigo"
        />
        <StatCard
          label="Expected rent / mo"
          value={paiseToInr(s.expectedMonthlyRentPaise)}
          hint="Occupied beds today"
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
          accent="zinc"
        />
      </div>

      <p className="text-xs text-zinc-500">
        Collections for <strong className="text-zinc-700">{monthLabel}</strong>: paid rent and
        electricity invoices for that billing month, plus approved QR payments tagged to that month
        (or approved in that month when no month tag). Occupancy and expected rent reflect today.
      </p>

      {metrics.ok && metrics.data.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Collection report by PG</h2>
          <PgBusinessMetricsTable
            rows={metrics.data}
            totals={{
              expectedMonthlyRentPaise: s.expectedMonthlyRentPaise,
              incomeRentPaise: s.incomeRentPaise,
              incomeRentQrPaise: s.incomeRentQrPaise,
              incomeRentInvoicePaise: s.incomeRentInvoicePaise,
              incomeElectricityPaise: s.incomeElectricityPaise,
              incomeElectricityQrPaise: s.incomeElectricityQrPaise,
              incomeElectricityInvoicePaise: s.incomeElectricityInvoicePaise,
              incomeTotalPaise: s.incomeTotalPaise,
            }}
          />
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
