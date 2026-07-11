import type { Metadata } from 'next';
import Link from 'next/link';
import { KpiCard, type KpiIconName } from '@/src/capital/components/KpiCard';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { getDashboardKpis, getInsights, getMonthlyProfitChart } from '@/src/capital/services/analytics';
import { MonthlyProfitChart } from '@/src/capital/components/charts/MonthlyProfitChart';

export const metadata: Metadata = { title: 'Dashboard' };

const kpis: Array<{
  title: string;
  key: string;
  icon: KpiIconName;
  trend?: 'up' | 'down' | 'neutral';
  text?: boolean;
  roi?: boolean;
  days?: boolean;
}> = [
  { title: 'Capital invested', key: 'totalCapitalInvestedPaise', icon: 'wallet', trend: 'neutral' },
  { title: 'Outstanding capital', key: 'capitalOutstandingPaise', icon: 'banknote', trend: 'neutral' },
  { title: 'Profit earned', key: 'profitEarnedPaise', icon: 'trendingUp', trend: 'up' },
  { title: 'Assets in stock', key: 'assetsInStock', icon: 'car', text: true },
  { title: 'Assets sold', key: 'assetsSold', icon: 'car', text: true },
  { title: 'Avg ROI', key: 'averageRoiBps', icon: 'trendingUp', roi: true },
  { title: 'Avg holding', key: 'averageHoldingDays', icon: 'clock', days: true },
  { title: 'Monthly profit', key: 'monthlyProfitPaise', icon: 'trendingUp', trend: 'up' },
];

export default async function DashboardPage() {
  const [kpiData, insights, chartData] = await Promise.all([
    getDashboardKpis(),
    getInsights(),
    getMonthlyProfitChart(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-ac-text-secondary">Portfolio overview and insights</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard
            key={k.title}
            title={k.title}
            index={i}
            icon={k.icon}
            trend={'trend' in k ? k.trend : 'neutral'}
            valuePaise={
              !k.text && !k.roi && !k.days ? kpiData[k.key as keyof typeof kpiData] as number : undefined
            }
            valueText={
              k.text
                ? String(kpiData[k.key as keyof typeof kpiData])
                : k.roi
                  ? `${(kpiData.averageRoiBps / 100).toFixed(1)}%`
                  : k.days
                    ? `${kpiData.averageHoldingDays} days`
                    : undefined
            }
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Smart insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Capital locked in active assets: <MoneyDisplay paise={insights.capitalLockedPaise} />
            </p>
            {insights.bestProfit ? (
              <p>
                Best performer:{' '}
                <Link href={`/assets/${insights.bestProfit.asset.id}`} className="text-ac-accent hover:underline">
                  {insights.bestProfit.auto.registrationNumber}
                </Link>{' '}
                — <MoneyDisplay paise={insights.bestProfit.asset.profitPaise ?? 0} />
              </p>
            ) : null}
            {insights.worstProfit ? (
              <p>
                Lowest performer:{' '}
                <Link href={`/assets/${insights.worstProfit.asset.id}`} className="text-ac-accent hover:underline">
                  {insights.worstProfit.auto.registrationNumber}
                </Link>{' '}
                — <MoneyDisplay paise={insights.worstProfit.asset.profitPaise ?? 0} />
              </p>
            ) : null}
            {insights.bestManufacturer ? (
              <p>
                Top manufacturer: {insights.bestManufacturer.manufacturer} (
                {(insights.bestManufacturer.avgRoiBps / 100).toFixed(1)}% avg ROI)
              </p>
            ) : null}
            {insights.staleAssets.length > 0 ? (
              <div>
                <p className="mb-2 text-ac-warning">Stale assets (&gt;90 days)</p>
                <ul className="space-y-1">
                  {insights.staleAssets.map(({ asset, auto }) => (
                    <li key={asset.id}>
                      <Link href={`/assets/${asset.id}`} className="text-ac-accent hover:underline">
                        {auto.registrationNumber}
                      </Link>{' '}
                      — {asset.holdingDays} days
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {insights.noMovement.length > 0 ? (
              <div>
                <p className="mb-2 text-ac-warning">No expense activity (30 days)</p>
                <ul className="space-y-1">
                  {insights.noMovement.map(({ asset, auto }) => (
                    <li key={asset.id}>
                      <Link href={`/assets/${asset.id}`} className="text-ac-accent hover:underline">
                        {auto.registrationNumber}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {insights.pendingSettlements.length > 0 ? (
              <div>
                <p className="mb-2 text-ac-warning">Pending settlements</p>
                <ul className="space-y-1">
                  {insights.pendingSettlements.map(({ asset, auto }) => (
                    <li key={asset.id}>
                      <Link href={`/assets/${asset.id}`} className="text-ac-accent hover:underline">
                        {auto.registrationNumber}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {insights.expectedReturns.length > 0 ? (
              <div>
                <p className="mb-2">Expected returns (listed)</p>
                <ul className="space-y-1">
                  {insights.expectedReturns.map(({ asset, auto }) => (
                    <li key={asset.id}>
                      <Link href={`/assets/${asset.id}`} className="text-ac-accent hover:underline">
                        {auto.registrationNumber}
                      </Link>{' '}
                      — <MoneyDisplay paise={asset.expectedSalePricePaise ?? 0} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ac-text-secondary">Money received</span>
              <MoneyDisplay paise={kpiData.moneyReceivedPaise} />
            </div>
            <div className="flex justify-between">
              <span className="text-ac-text-secondary">Yearly profit</span>
              <MoneyDisplay paise={kpiData.yearlyProfitPaise} />
            </div>
            <div className="flex justify-between">
              <span className="text-ac-text-secondary">Lifetime profit</span>
              <MoneyDisplay paise={kpiData.lifetimeProfitPaise} />
            </div>
            <div className="flex justify-between">
              <span className="text-ac-text-secondary">Monthly cash</span>
              <MoneyDisplay paise={kpiData.monthlyCashPaise} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly profit</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyProfitChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  );
}
