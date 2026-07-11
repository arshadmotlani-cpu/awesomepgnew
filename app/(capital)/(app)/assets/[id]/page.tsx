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
  return { title: `${detail.auto.registrationNumber} · Assets` };
}

export default async function AssetDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getAssetDetail(id);
  if (!detail) notFound();

  const { asset, auto } = detail;
  const timeline = await getAssetTimeline(id);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{auto.registrationNumber}</h1>
            <Badge>{asset.status}</Badge>
          </div>
          <p className="text-ac-text-secondary">{asset.displayName}</p>
        </div>
        <Link href="/assets">
          <Button variant="ghost">Back to assets</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Investment" paise={asset.totalInvestmentPaise} />
        <StatCard label="Outstanding" paise={asset.outstandingPaise} />
        <StatCard label="Profit" paise={asset.profitPaise ?? 0} />
        <StatCard label="Holding days" text={String(asset.holdingDays)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="Manufacturer" value={auto.manufacturer} />
          <Detail label="Model" value={auto.model} />
          <Detail label="Year" value={String(auto.year)} />
          <Detail label="Color" value={auto.color ?? '—'} />
          <Detail label="Purchase date" value={asset.purchaseDate} />
          <Detail label="Purchase price" value={<MoneyDisplay paise={asset.purchasePricePaise} />} />
        </CardContent>
      </Card>

      <AssetCommandCenter assetId={asset.id} currentStatus={asset.status} timeline={timeline} />
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
