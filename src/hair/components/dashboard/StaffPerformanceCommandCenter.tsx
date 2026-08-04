'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Gift,
  Package,
  Repeat,
  Scissors,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  ChartPanel,
  DashboardShell,
} from '@/src/hair/components/dashboard/DashboardShell';
import {
  StaffComparisonBarChart,
  StaffRevenueDonut,
} from '@/src/hair/components/dashboard/staff-performance/StaffPerformanceCharts';
import { StaffPerformanceFilterBar } from '@/src/hair/components/dashboard/staff-performance/StaffPerformanceFilterBar';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import {
  momDeltaDirection,
  type StaffRevenueCategory,
} from '@/src/hair/lib/staffPerformancePeriod';
import type { StaffPerformanceCommandCenterSnapshot } from '@/src/hair/services/staffPerformanceDashboard';

type Widget = {
  id: string;
  render: () => React.ReactNode;
};

function DeltaHint({ deltaPct }: { deltaPct: number | null }) {
  const dir = momDeltaDirection(deltaPct);
  if (dir === 'na') return <span className="text-fyh-text-muted">vs prior period</span>;
  const label = `${deltaPct! > 0 ? '+' : ''}${deltaPct}%`;
  if (dir === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-fyh-forest">
        <TrendingUp className="h-3 w-3" /> {label}
      </span>
    );
  }
  if (dir === 'down') {
    return (
      <span className="inline-flex items-center gap-1 text-rose-400/90">
        <TrendingDown className="h-3 w-3" /> {label}
      </span>
    );
  }
  return <span className="text-fyh-text-muted">{label}</span>;
}

function CategoryTable({
  title,
  rows,
}: {
  title: string;
  rows: StaffPerformanceCommandCenterSnapshot['serviceTable'];
}) {
  return (
    <ChartPanel title={title} subtitle="Attributed net · period">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-fyh-text-muted">No data available</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-fyh-text-muted">
                <th className="py-2 pr-3 font-medium">Staff</th>
                <th className="py-2 pr-3 font-medium">Revenue</th>
                <th className="py-2 pr-3 font-medium">Units</th>
                <th className="py-2 pr-3 font-medium">Avg</th>
                <th className="py-2 pr-3 font-medium">Refunds</th>
                <th className="py-2 pr-3 font-medium">Disc %</th>
                <th className="py-2 font-medium">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staffId} className="border-b border-white/5">
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/staff/${r.staffId}/performance`}
                      className="text-fyh-accent hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{formatInrFromPaise(r.revenuePaise)}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{r.unitsOrCount}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {formatInrFromPaise(r.averageValuePaise)}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{formatInrFromPaise(r.refundsPaise)}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{r.discountPct}%</td>
                  <td className="py-2.5 tabular-nums">{formatInrFromPaise(r.commissionPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartPanel>
  );
}

function inclusiveToDayKey(rangeToIso: string): string {
  return new Date(new Date(rangeToIso).getTime() - 86_400_000).toISOString().slice(0, 10);
}

export function StaffPerformanceCommandCenter({
  data,
}: {
  data: StaffPerformanceCommandCenterSnapshot;
}) {
  const [barCategory, setBarCategory] = useState<StaffRevenueCategory>(data.category);

  const kpiItems = [
    {
      label: 'Services',
      value: data.kpis.serviceRevenuePaise,
      delta: data.kpis.serviceDeltaPct,
      icon: Scissors,
      accent: true,
    },
    {
      label: 'Products',
      value: data.kpis.productRevenuePaise,
      delta: data.kpis.productDeltaPct,
      icon: ShoppingBag,
    },
    {
      label: 'Packages',
      value: data.kpis.packageRevenuePaise,
      delta: data.kpis.packageDeltaPct,
      icon: Package,
    },
    {
      label: 'Memberships',
      value: data.kpis.membershipRevenuePaise,
      delta: data.kpis.membershipDeltaPct,
      icon: Gift,
    },
    {
      label: 'Combined',
      value: data.kpis.combinedRevenuePaise,
      delta: data.kpis.combinedDeltaPct,
      icon: Wallet,
    },
  ] as const;

  const widgets: Widget[] = useMemo(
    () => [
      {
        id: 'filters',
        render: () => (
          <StaffPerformanceFilterBar
            salonName={data.salonName}
            periodPreset={data.periodPreset}
            category={data.category}
            staffIds={data.staffIdsFilter}
            from={data.rangeFromIso.slice(0, 10)}
            to={
              data.periodPreset === 'custom'
                ? inclusiveToDayKey(data.rangeToIso)
                : data.rangeToIso.slice(0, 10)
            }
            staffOptions={data.staffOptions}
          />
        ),
      },
      {
        id: 'kpis',
        render: () => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {kpiItems.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="fyh-dashboard-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="fyh-kpi-label">{k.label}</p>
                    <Icon className="h-4 w-4 text-fyh-forest opacity-80" />
                  </div>
                  <p
                    className={`fyh-kpi-hero mt-3 ${
                      'accent' in k && k.accent ? 'text-fyh-forest' : ''
                    }`}
                  >
                    {formatInrFromPaise(k.value)}
                  </p>
                  <p className="mt-2 text-xs">
                    <DeltaHint deltaPct={k.delta} />
                  </p>
                </div>
              );
            })}
          </div>
        ),
      },
      {
        id: 'leaderboard-distribution',
        render: () => (
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartPanel title="Top performers" subtitle="Combined attributed revenue">
              {data.leaderboard.length === 0 ? (
                <p className="py-8 text-center text-sm text-fyh-text-muted">No data available</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {data.leaderboard.map((row, idx) => (
                    <li key={row.staffId}>
                      <Link
                        href={`/staff/${row.staffId}/performance`}
                        className="flex items-center gap-4 py-3 transition hover:bg-white/[0.03]"
                      >
                        <span className="w-6 text-center text-sm font-semibold text-fyh-accent">
                          {idx + 1}
                        </span>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fyh-elevated text-sm font-semibold text-fyh-accent">
                          {row.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.photoUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            row.name.slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-fyh-text">{row.name}</p>
                          <p className="mt-0.5 text-xs text-fyh-text-muted">
                            {row.customersServed} customers · {row.servicesSoldCount} svc ·{' '}
                            {row.productsSoldCount} prod · avg{' '}
                            {formatInrFromPaise(row.averageBillPaise)}
                          </p>
                        </div>
                        <p className="tabular-nums font-semibold text-fyh-forest">
                          {formatInrFromPaise(row.revenuePaise)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </ChartPanel>
            <ChartPanel
              title="Revenue distribution"
              subtitle="Share of combined attributed revenue"
            >
              <StaffRevenueDonut data={data.distribution} />
            </ChartPanel>
          </div>
        ),
      },
      {
        id: 'comparison',
        render: () => (
          <ChartPanel title="Staff comparison" subtitle="Toggle category — no refetch">
            <div className="mb-4 flex flex-wrap gap-1">
              {(
                [
                  ['combined', 'Combined'],
                  ['service', 'Services'],
                  ['product', 'Products'],
                  ['package', 'Packages'],
                  ['membership', 'Memberships'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBarCategory(id)}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    barCategory === id
                      ? 'bg-fyh-accent/20 text-fyh-accent'
                      : 'bg-black/20 text-fyh-text-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <StaffComparisonBarChart data={data.comparison} category={barCategory} />
          </ChartPanel>
        ),
      },
      {
        id: 'category-tables',
        render: () => (
          <div className="grid gap-5 xl:grid-cols-2">
            <CategoryTable title="Services by staff" rows={data.serviceTable} />
            <CategoryTable title="Products by staff" rows={data.productTable} />
            <CategoryTable title="Packages by staff" rows={data.packageTable} />
            <CategoryTable title="Memberships by staff" rows={data.membershipTable} />
          </div>
        ),
      },
      {
        id: 'customers',
        render: () => {
          const c = data.customerMetrics;
          const cards = [
            { label: 'Repeat customers', value: String(c.repeatCustomers), icon: Repeat },
            { label: 'New customers', value: String(c.newCustomers), icon: Users },
            {
              label: 'Retention',
              value: c.retentionPct == null ? '—' : `${c.retentionPct}%`,
              icon: TrendingUp,
            },
            {
              label: 'Avg spend',
              value: formatInrFromPaise(c.averageSpendPaise),
              icon: Wallet,
            },
            {
              label: 'Highest bill',
              value: formatInrFromPaise(c.highestBillPaise),
              icon: TrendingUp,
            },
            {
              label: 'Lowest bill',
              value: formatInrFromPaise(c.lowestBillPaise),
              icon: TrendingDown,
            },
          ];
          return (
            <div>
              <h2 className="fyh-card-title mb-4">Customer metrics</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="fyh-dashboard-card p-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="fyh-kpi-label">{card.label}</p>
                        <Icon className="h-4 w-4 text-fyh-forest opacity-80" />
                      </div>
                      <p className="fyh-kpi-hero mt-3">{card.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        },
      },
    ],
    [data, barCategory, kpiItems],
  );

  return (
    <DashboardShell
      eyebrow="Team analytics"
      title="Staff Performance"
      subtitle={`${data.periodLabel} · attributed net before tax · ${data.salonName}`}
    >
      {widgets.map((w) => (
        <section key={w.id} data-widget={w.id}>
          {w.render()}
        </section>
      ))}
    </DashboardShell>
  );
}
