import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import { RevenueMtdBarChart } from '@/src/components/admin/revenue/charts/RevenueMtdBarChart';
import type { OwnerDashboardData } from '@/src/services/ownerDashboard';
import { OwnerKpiStrip } from '@/src/components/admin/overview/owner/OwnerKpiStrip';
import {
  OwnerCollectionDonut,
  OwnerOccupancyDistributionBar,
  OwnerRevenueCompositionChart,
} from '@/src/components/admin/overview/owner/OwnerChartPanels';
import {
  OwnerOccupancyTrendChart,
  OwnerPgSparkline,
  OwnerRevenueTrendChart,
} from '@/src/components/admin/overview/owner/OwnerTrendCharts';
import type { OwnerDashboardTrends } from '@/src/services/ownerDashboardTrends';
import { OwnerEcosystemHealthPanel } from '@/src/components/admin/overview/owner/OwnerEcosystemHealthPanel';

function OwnerPgCard({ card }: { card: OwnerDashboardData['pgCards'][0] }) {
  return (
    <Link
      href={card.href}
      className="block rounded-xl border border-white/10 bg-[#1A1F27] p-4 transition hover:border-white/20"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-white">{card.pgName}</h3>
        <span className="shrink-0 text-xs tabular-nums text-apg-silver">{card.occupancyPct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${card.occupancyPct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-apg-silver">
        {card.occupiedBeds}/{card.totalBeds} beds
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="text-apg-silver">Revenue MTD</p>
          <p className="font-semibold tabular-nums text-white">{paiseToInr(card.operatingRevenuePaise)}</p>
        </div>
        <div>
          <p className="text-apg-silver">Outstanding</p>
          <p className="font-semibold tabular-nums text-rose-300">{paiseToInr(card.outstandingPaise)}</p>
        </div>
        <div>
          <p className="text-apg-silver">Deposit held</p>
          <p className="font-semibold tabular-nums text-violet-300">{paiseToInr(card.depositHeldPaise)}</p>
        </div>
        <div>
          <p className="text-apg-silver">Collection</p>
          <p className="font-semibold tabular-nums text-emerald-300">{card.collectionPct}%</p>
        </div>
      </div>
      <div className="mt-3">
        <OwnerPgSparkline values={card.sparklineRevenuePaise} />
      </div>
    </Link>
  );
}

export function OwnerDashboard({
  data,
  trends,
}: {
  data: OwnerDashboardData;
  trends?: OwnerDashboardTrends;
}) {
  const collectionCenterLabel = `${data.collectionRatePct}%`;
  const collectionCenterSub =
    data.collectionRateDeltaPct != null
      ? `${data.collectionRateDeltaPct >= 0 ? '+' : ''}${data.collectionRateDeltaPct}% vs prior month`
      : 'collection rate';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-lg font-semibold text-white">Awesome PG portfolio</h1>
        <p className="mt-1 text-sm text-apg-silver">{data.monthLabel} · PG Engine health at a glance</p>
      </header>

      <OwnerKpiStrip kpis={data.kpis} />

      <OwnerEcosystemHealthPanel snapshot={data.ecosystemHealth ?? null} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {trends ? (
            <OwnerRevenueTrendChart points={trends.revenueTrend} />
          ) : (
            <section className="flex h-64 items-center justify-center rounded-xl border border-white/10 bg-[#1A1F27] text-sm text-apg-silver">
              Loading revenue trend…
            </section>
          )}
        </div>
        <OwnerCollectionDonut
          slices={data.collectionStatus}
          centerLabel={collectionCenterLabel}
          centerSub={collectionCenterSub}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {trends ? <OwnerOccupancyTrendChart points={trends.occupancyTrend} /> : null}
        <RevenueMtdBarChart rows={data.revenueByPg} depositLabel="Deposits (liability, MTD)" />
        <OwnerRevenueCompositionChart {...data.revenueComposition} />
      </div>

      <OwnerOccupancyDistributionBar {...data.occupancyDistribution} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">PG performance</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {(data.pgCards ?? []).length === 0 ? (
            <p className="col-span-full text-sm text-apg-silver">No active PGs in this portfolio view.</p>
          ) : (
            (data.pgCards ?? []).map((card) => (
              <OwnerPgCard key={card.pgId} card={card} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
