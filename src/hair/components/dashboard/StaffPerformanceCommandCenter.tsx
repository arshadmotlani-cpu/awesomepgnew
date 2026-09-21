'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DashboardShell } from '@/src/hair/components/dashboard/DashboardShell';
import {
  StaffPeriodComparisonChart,
  StaffTopTenBarChart,
} from '@/src/hair/components/dashboard/staff-performance/StaffPerformanceCharts';
import { StaffPerformanceFilterBar } from '@/src/hair/components/dashboard/staff-performance/StaffPerformanceFilterBar';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { StaffPerformanceCommandCenterSnapshot } from '@/src/hair/services/staffPerformanceDashboard';

function SummaryTable({
  title,
  subtitle,
  headers,
  rows,
  renderRow,
}: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: unknown[];
  renderRow: (row: unknown, idx: number) => React.ReactNode;
}) {
  return (
    <section className="fyh-dashboard-card p-4">
      <h2 className="fyh-card-title">{title}</h2>
      <p className="mt-1 text-xs text-fyh-text-muted">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-fyh-text-muted">No data available</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--fyh-border)] text-xs text-fyh-text-muted">
                {headers.map((h) => (
                  <th key={h} className="py-2 pr-3 last:pr-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function inclusiveToDayKey(rangeToIso: string): string {
  return new Date(new Date(rangeToIso).getTime() - 86_400_000).toISOString().slice(0, 10);
}

export function StaffPerformanceCommandCenter({
  data,
  locationOptions,
}: {
  data: StaffPerformanceCommandCenterSnapshot;
  locationOptions: { locationId: string; locationName: string; isActive: boolean }[];
}) {
  const [compareMetric, setCompareMetric] = useState<'sales' | 'performance'>('sales');

  const periodTitle = useMemo(() => {
    const from = data.rangeFromIso.slice(0, 10);
    const to =
      data.periodPreset === 'custom'
        ? inclusiveToDayKey(data.rangeToIso)
        : data.rangeToIso.slice(0, 10);
    return data.periodLabel.includes('→') ? data.periodLabel : `${from} → ${to}`;
  }, [data]);

  return (
    <DashboardShell
      eyebrow="Team analytics"
      title="Staff Performance"
      subtitle={`${periodTitle} · ${data.salonName}`}
    >
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
        locationOptions={locationOptions}
        locationIds={data.locationIds}
        comparisonMode={data.comparisonMode}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="fyh-dashboard-card p-4">
          <h2 className="fyh-card-title">Top 10 Staff — Sales</h2>
          <p className="mt-1 text-xs text-fyh-text-muted">
            Total Sales · {formatInrFromPaise(data.totalSalesPaise)}
          </p>
          <div className="mt-4">
            <StaffTopTenBarChart rows={data.topTenSales} valueLabel="Sales" />
          </div>
        </section>
        <section className="fyh-dashboard-card p-4">
          <h2 className="fyh-card-title">Top 10 Staff — Performance Amount</h2>
          <p className="mt-1 text-xs text-fyh-text-muted">
            Total Performance Amount · {formatInrFromPaise(data.totalPerformanceAmountPaise)}
          </p>
          <p className="text-[10px] text-fyh-text-muted">
            Service, package & membership attribution — excludes product retail (not salary or
            payout).
          </p>
          <div className="mt-4">
            <StaffTopTenBarChart rows={data.topTenPerformance} valueLabel="Performance" />
          </div>
        </section>
      </div>

      <SummaryTable
        title="Total Sales"
        subtitle="Attributed net sales by category"
        headers={[
          'Staff Name',
          'Service (₹)',
          'Product (₹)',
          'Package (₹)',
          'Membership (₹)',
          'Gift Card (₹)',
          'Total (₹)',
        ]}
        rows={data.salesSummaryTable}
        renderRow={(row, idx) => {
          const r = row as StaffPerformanceCommandCenterSnapshot['salesSummaryTable'][number];
          return (
            <tr key={r.staffId} className="border-b border-[color:var(--fyh-border)] last:border-0">
              <td className="py-2 pr-3">
                <Link href={`/staff/${r.staffId}/performance`} className="text-fyh-accent hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.servicePaise)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.productPaise)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.packagePaise)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.membershipPaise)}</td>
              <td className="py-2 pr-3 tabular-nums text-fyh-text-muted">
                {r.giftCardPaise === 0 ? '—' : formatInrFromPaise(r.giftCardPaise)}
              </td>
              <td className="py-2 tabular-nums font-medium">{formatInrFromPaise(r.totalPaise)}</td>
            </tr>
          );
        }}
      />

      <SummaryTable
        title="Total Performance Amount"
        subtitle="Existing staff-performance SSOT (attributed net)"
        headers={['Staff Name', 'Net Service (₹)', 'Membership (₹)', 'Package (₹)', 'Total (₹)']}
        rows={data.performanceAmountTable}
        renderRow={(row) => {
          const r = row as StaffPerformanceCommandCenterSnapshot['performanceAmountTable'][number];
          return (
            <tr key={r.staffId} className="border-b border-[color:var(--fyh-border)] last:border-0">
              <td className="py-2 pr-3">
                <Link href={`/staff/${r.staffId}/performance`} className="text-fyh-accent hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.netServicePaise)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.membershipPaise)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.packagePaise)}</td>
              <td className="py-2 tabular-nums font-medium">{formatInrFromPaise(r.totalPaise)}</td>
            </tr>
          );
        }}
      />

      <section className="fyh-dashboard-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="fyh-card-title">Previous period vs current period</h2>
            <p className="mt-1 text-xs text-fyh-text-muted">
              {data.comparisonMode === 'same_mtd_last_month'
                ? 'Same MTD last month'
                : 'Previous equivalent period'}
            </p>
          </div>
          <div className="flex gap-1 rounded-md border border-[color:var(--fyh-border)] p-0.5">
            <button
              type="button"
              onClick={() => setCompareMetric('sales')}
              className={`rounded px-3 py-1 text-xs ${
                compareMetric === 'sales'
                  ? 'bg-fyh-accent/20 text-fyh-accent'
                  : 'text-fyh-text-secondary'
              }`}
            >
              Sales
            </button>
            <button
              type="button"
              onClick={() => setCompareMetric('performance')}
              className={`rounded px-3 py-1 text-xs ${
                compareMetric === 'performance'
                  ? 'bg-fyh-accent/20 text-fyh-accent'
                  : 'text-fyh-text-secondary'
              }`}
            >
              Performance Amount
            </button>
          </div>
        </div>
        <div className="mt-4">
          <StaffPeriodComparisonChart
            comparison={data.periodComparison}
            metric={compareMetric}
          />
        </div>
      </section>
    </DashboardShell>
  );
}
