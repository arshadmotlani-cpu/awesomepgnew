import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { formatOverviewMetricValue } from '@/src/services/overviewDashboard';
import type { BusinessAnalyticsSnapshot } from '@/src/services/businessAnalytics';

export function BusinessAnalyticsDashboard({ data }: { data: BusinessAnalyticsSnapshot }) {
  const cards = [
    {
      label: 'Occupancy',
      value: `${data.occupancyPct}%`,
      hint: `${data.occupiedBeds}/${data.totalBeds} beds`,
      href: '/admin/occupancy',
    },
    {
      label: 'Revenue MTD',
      value: formatOverviewMetricValue('money', data.revenueMtdPaise),
      hint: 'SSOT: revenue command center',
      href: '/admin/revenue',
    },
    {
      label: 'Rent collected MTD',
      value: formatOverviewMetricValue('money', data.rentMtdPaise),
      href: '/admin/rent',
    },
    {
      label: 'Visitors this month',
      value: data.visitorsMonth.toLocaleString('en-IN'),
      hint: `${data.uniqueVisitorsMonth} unique`,
      href: '/admin/analytics',
    },
    {
      label: 'Returning visitors (est.)',
      value: data.returningVisitorEstimate.toLocaleString('en-IN'),
      hint: 'Unique minus first-time estimate',
    },
    {
      label: 'Active PGs',
      value: data.activePgs.toLocaleString('en-IN'),
      href: '/admin/pgs',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-white/10 bg-[#1A1F27] p-4 transition hover:border-[#FF5A1F]/30"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{card.value}</p>
          {card.hint ? <p className="mt-1 text-xs text-apg-silver">{card.hint}</p> : null}
          {card.href ? (
            <Link href={card.href} className="mt-3 inline-block text-xs font-medium text-[#FF5A1F] hover:underline">
              View details →
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function BusinessAnalyticsOccupancyBar({ pct }: { pct: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Occupancy trend</h3>
        <Badge tone="zinc">{pct}%</Badge>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#FF5A1F] transition-all"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}
