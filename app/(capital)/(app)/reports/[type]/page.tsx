import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Button } from '@/src/capital/components/ui/button';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { getDealershipReportKpis } from '@/src/capital/services/analytics';
import { listAssetsQuery } from '@/src/capital/services/assets';

export const metadata: Metadata = { title: 'Report' };

const formats = [
  { format: 'csv', label: 'CSV' },
  { format: 'xlsx', label: 'Excel' },
  { format: 'pdf', label: 'PDF' },
];

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const title = type.replace(/-/g, ' ');
  const [kpis, outstanding] = await Promise.all([
    getDealershipReportKpis(),
    listAssetsQuery({
      page: 1,
      pageSize: 100,
      sort: 'investment',
      order: 'desc',
      profitFilter: 'all',
    }),
  ]);

  const isPnl = type === 'profit-loss' || type === 'pnl';
  const isPeriod =
    type === 'monthly' || type === 'quarterly' || type === 'yearly' || type === 'lifetime';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-ac-accent hover:underline">
          ← Reports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold capitalize tracking-tight">{title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {type === 'outstanding' ? (
            <>
              <p className="text-ac-text-muted">
                Sold vehicles not yet closed ({outstanding.rows.filter((r) => r.asset.status === 'sold').length}{' '}
                shown)
              </p>
              {outstanding.rows
                .filter((r) => r.asset.status === 'sold')
                .slice(0, 8)
                .map(({ asset, auto }) => (
                  <div key={asset.id} className="flex justify-between border-b border-white/5 py-2">
                    <span>{auto.registrationNumber ?? asset.displayName}</span>
                    <MoneyDisplay paise={asset.totalInvestmentPaise} />
                  </div>
                ))}
            </>
          ) : type === 'cash-flow' ? (
            <>
              <div className="flex justify-between">
                <span>Active Capital</span>
                <MoneyDisplay paise={kpis.activeCapitalPaise} />
              </div>
              <div className="flex justify-between">
                <span>Inventory TVI</span>
                <MoneyDisplay paise={kpis.currentInvestmentPaise} />
              </div>
            </>
          ) : type === 'roi' ? (
            <>
              <div className="flex justify-between">
                <span>Avg My ROI</span>
                <span>{((kpis.averageMyRoiBps ?? 0) / 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-ac-text-muted">
                <span className="text-sm">Per-deal average (not portfolio ROI)</span>
              </div>
            </>
          ) : isPnl || isPeriod ? (
            <>
              <div className="flex justify-between">
                <span>Active Capital</span>
                <MoneyDisplay paise={kpis.activeCapitalPaise} />
              </div>
              <div className="flex justify-between">
                <span>My Profit (entitled)</span>
                <MoneyDisplay
                  paise={
                    type === 'monthly'
                      ? kpis.monthlyProfitPaise
                      : type === 'yearly'
                        ? kpis.yearlyProfitPaise
                        : kpis.profitEarnedPaise
                  }
                />
              </div>
              <div className="flex justify-between">
                <span>Vehicles in stock</span>
                <span>{kpis.assetsInStock}</span>
              </div>
              <div className="flex justify-between">
                <span>Vehicles sold</span>
                <span>{kpis.assetsSold}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span>Active Capital</span>
                <MoneyDisplay paise={kpis.activeCapitalPaise} />
              </div>
              <div className="flex justify-between">
                <span>My Profit (entitled)</span>
                <MoneyDisplay paise={kpis.profitEarnedPaise} />
              </div>
              <div className="flex justify-between">
                <span>Vehicles in stock</span>
                <span>{kpis.assetsInStock}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {formats.map((f) => (
            <Button key={f.format} variant="secondary" asChild>
              <a href={`/api/capital/export/${type}?format=${f.format}`} download>
                Download {f.label}
              </a>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
