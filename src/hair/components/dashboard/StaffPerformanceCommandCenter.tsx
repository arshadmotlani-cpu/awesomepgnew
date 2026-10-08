'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { DashboardShell } from '@/src/hair/components/dashboard/DashboardShell';
import { StaffTopTenBarChart } from '@/src/hair/components/dashboard/staff-performance/StaffPerformanceCharts';
import { StaffPerformanceFilterBar } from '@/src/hair/components/dashboard/staff-performance/StaffPerformanceFilterBar';
import { formatStaffPerformanceDayLabel } from '@/src/hair/lib/formatStaffPerformanceDay';
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
    <section className="rounded-lg border border-[color:var(--fyh-border)] bg-white p-4 shadow-sm">
      <h2 className="fyh-card-title text-fyh-text">{title}</h2>
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

export function StaffPerformanceCommandCenter({
  data,
  locationOptions,
}: {
  data: StaffPerformanceCommandCenterSnapshot;
  locationOptions: { locationId: string; locationName: string; isActive: boolean }[];
}) {
  const periodTitle = useMemo(() => {
    if (data.fromDayKey === data.toDayKey) {
      return formatStaffPerformanceDayLabel(data.fromDayKey);
    }
    return `${formatStaffPerformanceDayLabel(data.fromDayKey)} → ${formatStaffPerformanceDayLabel(data.toDayKey)}`;
  }, [data.fromDayKey, data.toDayKey]);

  return (
    <div className="fyh-theme-light -mx-[var(--fyh-space-page)] min-h-full bg-[#f4f6f8] px-[var(--fyh-space-page)] pb-8 md:-mx-[var(--fyh-space-page-md)] md:px-[var(--fyh-space-page-md)]">
      <DashboardShell
        eyebrow="Team analytics"
        title="Staff Performance"
        subtitle={`${periodTitle} · ${data.salonName}`}
        rootClassName="!bg-transparent"
      >
        <StaffPerformanceFilterBar
          salonName={data.salonName}
          fromDayKey={data.fromDayKey}
          toDayKey={data.toDayKey}
          category={data.category}
          staffIds={data.staffIdsFilter}
          staffOptions={data.staffOptions}
          locationOptions={locationOptions}
          locationIds={data.locationIds}
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-[color:var(--fyh-border)] bg-white p-4 shadow-sm">
            <h2 className="fyh-card-title text-fyh-text">Top 10 Staff — Product Sales</h2>
            <p className="mt-1 text-xs text-fyh-text-muted">
              Total product sales · {formatInrFromPaise(data.totalProductSalesPaise)}
            </p>
            <div className="mt-4">
              <StaffTopTenBarChart rows={data.topTenSales} valueLabel="Sales" variant="light" />
            </div>
          </section>
          <section className="rounded-lg border border-[color:var(--fyh-border)] bg-white p-4 shadow-sm">
            <h2 className="fyh-card-title text-fyh-text">Top 10 Staff — Service Performance</h2>
            <p className="mt-1 text-xs text-fyh-text-muted">
              Total service performance · {formatInrFromPaise(data.totalServicePerformancePaise)}
            </p>
            <p className="text-[10px] text-fyh-text-muted">
              Services, memberships, and packages. Product sales are separate. Not payroll or
              incentives.
            </p>
            <div className="mt-4">
              <StaffTopTenBarChart
                rows={data.topTenPerformance}
                valueLabel="Performance"
                variant="light"
              />
            </div>
          </section>
        </div>

        <div className="mt-4 space-y-4">
          <SummaryTable
            title="Product sales by staff"
            subtitle="Physical retail products only. Services, memberships, and packages are not included."
            headers={['Staff Name', 'Product (₹)', 'Total (₹)']}
            rows={data.salesSummaryTable}
            renderRow={(row) => {
              const r = row as StaffPerformanceCommandCenterSnapshot['salesSummaryTable'][number];
              return (
                <tr key={r.staffId} className="border-b border-[color:var(--fyh-border)] last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/staff/${r.staffId}/performance`}
                      className="text-fyh-accent hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{formatInrFromPaise(r.productPaise)}</td>
                  <td className="py-2 tabular-nums font-medium">{formatInrFromPaise(r.totalPaise)}</td>
                </tr>
              );
            }}
          />

          <SummaryTable
            title="Service performance by staff"
            subtitle="Total is service + membership + package. Product sales are not included."
            headers={[
              'Staff Name',
              'Service (₹)',
              'Membership (₹)',
              'Package (₹)',
              'Total service performance (₹)',
            ]}
            rows={data.performanceAmountTable}
            renderRow={(row) => {
              const r = row as StaffPerformanceCommandCenterSnapshot['performanceAmountTable'][number];
              return (
                <tr key={r.staffId} className="border-b border-[color:var(--fyh-border)] last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/staff/${r.staffId}/performance`}
                      className="text-fyh-accent hover:underline"
                    >
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
        </div>
      </DashboardShell>
    </div>
  );
}
