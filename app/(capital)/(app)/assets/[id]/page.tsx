import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetCommandCenter } from '@/src/capital/components/AssetCommandCenter';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { getAssetDetail, getAssetTimeline } from '@/src/capital/services/assets';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getAssetDetail(id);
  if (!detail) return { title: 'Asset' };
  return { title: `${detail.asset.displayName} · Assets` };
}

export default async function AssetDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getAssetDetail(id);
  if (!detail) notFound();

  const { asset, auto, investors } = detail;
  const timeline = await getAssetTimeline(id);

  const fuelLabels: Record<string, string> = {
    petrol: 'Petrol',
    diesel: 'Diesel',
    cng: 'CNG',
    ev: 'EV',
    hybrid: 'Hybrid',
  };
  const ownershipLabels: Record<string, string> = {
    first_owner: 'First Owner',
    second_owner: 'Second Owner',
    third_owner: 'Third Owner',
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{asset.displayName}</h1>
            <Badge>{asset.status}</Badge>
          </div>
          {auto.registrationNumber ? (
            <p className="text-ac-text-secondary">{auto.registrationNumber}</p>
          ) : null}
        </div>
        <Link href="/assets">
          <Button variant="ghost">Back to assets</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Investment" paise={asset.totalInvestmentPaise} />
        <StatCard label="Outstanding" paise={asset.outstandingPaise} />
        <StatCard label="Gross Profit" paise={asset.profitPaise ?? 0} />
        <StatCard label="Holding days" text={String(asset.holdingDays)} />
      </div>

      {asset.mySharePaise != null || asset.partnerSharePaise != null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Partner Share" paise={asset.partnerSharePaise ?? 0} />
          <StatCard label="My Share" paise={asset.mySharePaise ?? 0} />
          <StatCard
            label="Business ROI"
            text={
              asset.businessRoiBps != null
                ? `${(asset.businessRoiBps / 100).toFixed(1)}%`
                : '—'
            }
          />
          <StatCard
            label="My ROI"
            text={asset.myRoiBps != null ? `${(asset.myRoiBps / 100).toFixed(1)}%` : '—'}
          />
        </div>
      ) : null}

      {investors.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Investment structure</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-ac-text-muted">
                  <th className="pb-2 pr-4 font-medium">Investor</th>
                  <th className="pb-2 pr-4 font-medium">Invested</th>
                  <th className="pb-2 pr-4 font-medium">Profit</th>
                  <th className="pb-2 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((inv) => (
                  <tr key={inv.id} className="border-b border-white/5">
                    <td className="py-2 pr-4 font-medium">{inv.label}</td>
                    <td className="py-2 pr-4">
                      <MoneyDisplay paise={inv.investedPaise} />
                    </td>
                    <td className="py-2 pr-4">
                      {inv.profitPaise != null ? (
                        <MoneyDisplay paise={inv.profitPaise} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2">
                      {inv.roiBps != null ? `${(inv.roiBps / 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Vehicle details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="Manufacturer" value={auto.manufacturer} />
          <Detail label="Model" value={auto.model} />
          <Detail label="Fuel Type" value={auto.fuelType ? fuelLabels[auto.fuelType] ?? auto.fuelType : '—'} />
          <Detail label="Year" value={String(auto.year)} />
          <Detail
            label="Ownership"
            value={auto.ownership ? ownershipLabels[auto.ownership] ?? auto.ownership : '—'}
          />
          <Detail label="Purchase date" value={asset.purchaseDate} />
          <Detail label="Purchase price" value={<MoneyDisplay paise={asset.purchasePricePaise} />} />
        </CardContent>
      </Card>

      <AssetCommandCenter
        assetId={asset.id}
        currentStatus={asset.status}
        totalInvestmentPaise={asset.totalInvestmentPaise}
        timeline={timeline}
        investors={investors.map((i) => ({
          slot: i.slot,
          label: i.label,
          investedPaise: i.investedPaise,
        }))}
      />
    </div>
  );
}

function StatCard({ label, paise, text }: { label: string; paise?: number; text?: string }) {
  return (
    <div className="ac-glass-card p-4">
      <p className="text-xs text-ac-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold">
        {text ?? (paise != null ? <MoneyDisplay paise={paise} /> : '—')}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-2">
      <span className="text-ac-text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
