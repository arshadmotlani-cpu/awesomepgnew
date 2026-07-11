import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Button } from '@/src/capital/components/ui/button';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { getDashboardKpis } from '@/src/capital/services/analytics';
import { listCapitalInvestments } from '@/src/capital/services/capital';
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
  const [kpis, investments, outstanding] = await Promise.all([
    getDashboardKpis(),
    listCapitalInvestments(),
    listAssetsQuery({ page: 1, pageSize: 100, sort: 'investment', order: 'desc', profitFilter: 'all' }),
  ]);

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
              <p>{outstanding.total} assets with outstanding capital</p>
              {outstanding.rows.slice(0, 5).map(({ asset, auto }) => (
                <div key={asset.id} className="flex justify-between border-b border-white/5 py-2">
                  <span>{auto.registrationNumber}</span>
                  <MoneyDisplay paise={asset.outstandingPaise} />
                </div>
              ))}
            </>
          ) : type === 'cash-flow' ? (
            <>
              <div className="flex justify-between">
                <span>Capital invested</span>
                <MoneyDisplay paise={kpis.totalCapitalInvestedPaise} />
              </div>
              <div className="flex justify-between">
                <span>Money received</span>
                <MoneyDisplay paise={kpis.moneyReceivedPaise} />
              </div>
            </>
          ) : type === 'roi' ? (
            <p>Average ROI: {(kpis.averageRoiBps / 100).toFixed(1)}%</p>
          ) : type === 'profit-loss' ? (
            <>
              <div className="flex justify-between">
                <span>Profit earned</span>
                <MoneyDisplay paise={kpis.profitEarnedPaise} />
              </div>
              <div className="flex justify-between">
                <span>Yearly profit</span>
                <MoneyDisplay paise={kpis.yearlyProfitPaise} />
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span>Total capital</span>
                <MoneyDisplay paise={kpis.totalCapitalInvestedPaise} />
              </div>
              <div className="flex justify-between">
                <span>Investments recorded</span>
                <span>{investments.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Assets in stock</span>
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
