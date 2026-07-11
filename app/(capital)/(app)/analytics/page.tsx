import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import {
  CashFlowChart,
  CategoryBarChart,
  CountLineChart,
  HoldingLineChart,
  RoiLineChart,
  ValueBarChart,
} from '@/src/capital/components/charts/AnalyticsCharts';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { getAnalyticsBundle } from '@/src/capital/services/analytics';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  const data = await getAnalyticsBundle();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-ac-text-secondary">Extended portfolio analysis</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-ac-text-secondary">Average ROI</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {(data.kpis.averageRoiBps / 100).toFixed(1)}%
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-ac-text-secondary">Avg holding period</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.kpis.averageHoldingDays} days</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-ac-text-secondary">Yearly profit</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            <MoneyDisplay paise={data.kpis.yearlyProfitPaise} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly profit">
          <ValueBarChart data={data.monthlyProfit} label="Profit" />
        </ChartCard>
        <ChartCard title="Cash flow">
          <CashFlowChart data={data.cashFlow} />
        </ChartCard>
        <ChartCard title="Capital investments">
          <ValueBarChart data={data.investments} label="Invested" />
        </ChartCard>
        <ChartCard title="Expenses by category">
          <CategoryBarChart data={data.expensesByCategory} />
        </ChartCard>
        <ChartCard title="Assets purchased">
          <CountLineChart data={data.purchased} label="Purchased" />
        </ChartCard>
        <ChartCard title="Assets sold">
          <CountLineChart data={data.sold} label="Sold" />
        </ChartCard>
        <ChartCard title="ROI trend">
          <RoiLineChart data={data.roiTrend} />
        </ChartCard>
        <ChartCard title="Holding time trend">
          <HoldingLineChart data={data.holdingTime} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manufacturer performance</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">Manufacturer</th>
                <th className="pb-3 pr-4 font-medium">Assets</th>
                <th className="pb-3 pr-4 font-medium">Avg ROI</th>
                <th className="pb-3 font-medium text-right">Total profit</th>
              </tr>
            </thead>
            <tbody>
              {data.manufacturers.map((m) => (
                <tr key={m.manufacturer} className="border-b border-white/5">
                  <td className="py-3 pr-4 font-medium">{m.manufacturer}</td>
                  <td className="py-3 pr-4">{m.count}</td>
                  <td className="py-3 pr-4">{(m.avgRoiBps / 100).toFixed(1)}%</td>
                  <td className="py-3 text-right">
                    <MoneyDisplay paise={m.totalProfitPaise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
