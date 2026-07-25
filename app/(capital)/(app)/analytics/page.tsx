import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import {
  AcquisitionChart,
  CashFlowChart,
  CountBarChart,
  HoldingLineChart,
  RoiLineChart,
  ValueBarChart,
} from '@/src/capital/components/charts/AnalyticsCharts';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { getAnalyticsBundle } from '@/src/capital/services/analytics';

export const metadata: Metadata = { title: 'Analytics' };

const FUEL_LABELS: Record<string, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  cng: 'CNG',
  ev: 'EV',
  hybrid: 'Hybrid',
  unknown: 'Unknown',
};

export default async function AnalyticsPage() {
  const data = await getAnalyticsBundle();
  const k = data.insightKpis;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-ac-text-secondary">
          Deep insights into your dealership — My profit and My ROI only. Daily totals live on the{' '}
          <Link href="/dashboard" className="text-ac-accent hover:underline">
            Dashboard
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InsightKpi
          title="Avg holding (sold)"
          value={`${k.averageHoldingDays} days`}
          hint="How long capital stays locked before sale"
        />
        <InsightKpi
          title="Avg My ROI"
          value={`${(k.averageMyRoiBps / 100).toFixed(1)}%`}
          hint="Mean of per-deal My ROI (not portfolio ROI)"
        />
        <InsightKpi
          title="Stale inventory"
          value={String(k.staleInventoryCount)}
          hint="In-stock vehicles held over 90 days"
        />
        <InsightKpi
          title="Repair on active"
          value={<MoneyDisplay paise={k.repairSpendOnActivePaise} className="text-2xl" />}
          hint="Repair totals on vehicles still under repair"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Cash flow" subtitle="Payments in vs capital invested out">
          <CashFlowChart data={data.cashFlow} />
        </ChartCard>
        <ChartCard title="Holding time trend" subtitle="Avg days held by sale month">
          <HoldingLineChart data={data.holdingTime} />
        </ChartCard>
        <ChartCard title="My ROI trend" subtitle="Avg My ROI by sale month">
          <RoiLineChart data={data.roiTrend} />
        </ChartCard>
        <ChartCard title="Inventory ageing" subtitle="In-stock vehicles by days held">
          <CountBarChart data={data.inventoryAgeing} label="Vehicles" />
        </ChartCard>
        <ChartCard title="Acquisition trends" subtitle="Vehicles bought and purchase capital">
          <AcquisitionChart data={data.acquisition} />
        </ChartCard>
        <ChartCard title="Repair trends" subtitle="Repair spend by vehicle month">
          <ValueBarChart data={data.repairTrends} label="Repairs" />
        </ChartCard>
        <ChartCard title="Profit distribution" subtitle="Sold deals by My profit band">
          <CountBarChart data={data.profitDistribution} label="Deals" />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manufacturer profitability</CardTitle>
          <p className="text-xs text-ac-text-muted">My share and My ROI only</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">Manufacturer</th>
                <th className="pb-3 pr-4 font-medium">Deals</th>
                <th className="pb-3 pr-4 font-medium">Avg My ROI</th>
                <th className="pb-3 font-medium text-right">My Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.manufacturers.map((m) => (
                <tr key={m.manufacturer} className="border-b border-white/5">
                  <td className="py-3 pr-4 font-medium">{m.manufacturer}</td>
                  <td className="py-3 pr-4">{m.count}</td>
                  <td className="py-3 pr-4">{(m.avgMyRoiBps / 100).toFixed(1)}%</td>
                  <td className="py-3 text-right">
                    <MoneyDisplay paise={m.totalMySharePaise} />
                  </td>
                </tr>
              ))}
              {data.manufacturers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ac-text-muted">
                    No sold deals yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fuel type performance</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-ac-text-muted">
                  <th className="pb-3 pr-4 font-medium">Fuel</th>
                  <th className="pb-3 pr-4 font-medium">Deals</th>
                  <th className="pb-3 pr-4 font-medium">Avg My ROI</th>
                  <th className="pb-3 font-medium text-right">My Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.fuelPerformance.map((f) => (
                  <tr key={f.fuelType} className="border-b border-white/5">
                    <td className="py-3 pr-4 font-medium">
                      {FUEL_LABELS[f.fuelType] ?? f.fuelType}
                    </td>
                    <td className="py-3 pr-4">{f.count}</td>
                    <td className="py-3 pr-4">{(f.avgMyRoiBps / 100).toFixed(1)}%</td>
                    <td className="py-3 text-right">
                      <MoneyDisplay paise={f.totalMySharePaise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model year performance</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-ac-text-muted">
                  <th className="pb-3 pr-4 font-medium">Year</th>
                  <th className="pb-3 pr-4 font-medium">Deals</th>
                  <th className="pb-3 pr-4 font-medium">Avg My ROI</th>
                  <th className="pb-3 font-medium text-right">My Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.yearPerformance.map((y) => (
                  <tr key={y.year} className="border-b border-white/5">
                    <td className="py-3 pr-4 font-medium">{y.year}</td>
                    <td className="py-3 pr-4">{y.count}</td>
                    <td className="py-3 pr-4">{(y.avgMyRoiBps / 100).toFixed(1)}%</td>
                    <td className="py-3 text-right">
                      <MoneyDisplay paise={y.totalMySharePaise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VehicleList
          title="Best vehicles (My profit)"
          rows={data.vehiclePerformance.best}
        />
        <VehicleList
          title="Weakest vehicles (My profit)"
          rows={data.vehiclePerformance.worst}
        />
      </div>
    </div>
  );
}

function InsightKpi({
  title,
  value,
  hint,
}: {
  title: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-ac-text-secondary">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-[11px] text-ac-text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle ? <p className="text-xs text-ac-text-muted">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function VehicleList({
  title,
  rows,
}: {
  title: string;
  rows: {
    id: string;
    displayName: string;
    mySharePaise: number | null;
    myRoiBps: number | null;
    holdingDays: number | null;
  }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-white/5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/assets/${r.id}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm transition hover:text-ac-accent"
              >
                <span className="min-w-0 truncate font-medium">{r.displayName}</span>
                <span className="shrink-0 text-right">
                  <MoneyDisplay paise={r.mySharePaise ?? 0} className="text-sm" />
                  <span className="mt-0.5 block text-[10px] text-ac-text-muted">
                    {r.myRoiBps != null ? `${(r.myRoiBps / 100).toFixed(1)}% ROI` : '—'}
                    {r.holdingDays != null ? ` · ${r.holdingDays}d` : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="py-6 text-center text-sm text-ac-text-muted">No sold deals yet.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
