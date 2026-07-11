import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetCommandCenter } from '@/src/capital/components/AssetCommandCenter';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { getAssetDetail, getAssetTimeline } from '@/src/capital/services/assets';
import { getSettings } from '@/src/capital/services/settings';
import { formatInrPlain } from '@/src/capital/lib/money';

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
  const [timeline, settings] = await Promise.all([getAssetTimeline(id), getSettings()]);

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

  const fundingGap = asset.fundingGapPaise ?? 0;
  const fundingStatus =
    fundingGap === 0
      ? 'Fully funded'
      : fundingGap > 0
        ? `Underfunded by ₹${formatInrPlain(fundingGap)}`
        : `Overfunded by ₹${formatInrPlain(-fundingGap)}`;

  const sold = asset.actualSalePricePaise != null;
  const isActive = !['sold', 'settled', 'cancelled'].includes(asset.status);

  const me = investors.find((i) => i.slot === 'me');
  const investor2 = investors.find((i) => i.slot === 'investor_2');
  const investor3 = investors.find((i) => i.slot === 'investor_3');
  const myInvestmentPaise = me?.investedPaise ?? 0;
  /** My money locked in this vehicle while it is still active */
  const capitalAtRiskPaise = isActive ? myInvestmentPaise : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{asset.displayName}</h1>
            <Badge>{asset.status}</Badge>
            <Badge variant={fundingGap === 0 ? 'success' : 'warning'}>{fundingStatus}</Badge>
          </div>
          {auto.registrationNumber ? (
            <p className="text-ac-text-secondary">{auto.registrationNumber}</p>
          ) : null}
        </div>
        <Link href="/assets">
          <Button variant="ghost">Back to assets</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Position</CardTitle>
          <p className="text-xs text-ac-text-muted">
            Cost, funding, and {sold ? 'realized' : 'current'} capital exposure for this vehicle
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Purchase Price" paise={asset.purchasePricePaise} />
          <StatCard label="Repairs" paise={asset.repairTotalPaise ?? 0} />
          <StatCard label="Refunds / Credits" paise={asset.dealerRefundTotalPaise ?? 0} />
          <StatCard label="Net Vehicle Cost" paise={asset.totalInvestmentPaise} />
          <StatCard label="Funding Status" text={fundingStatus} />
          <StatCard label="My Investment" paise={myInvestmentPaise} />
          <StatCard
            label={investor2?.label ?? 'Investor 2 Investment'}
            paise={investor2?.investedPaise ?? 0}
          />
          <StatCard
            label={investor3?.label ?? 'Investor 3 Investment'}
            paise={investor3?.investedPaise ?? 0}
          />
          <StatCard label="Funding Gap" paise={fundingGap} />
          {isActive ? (
            <StatCard label="Current Capital At Risk" paise={capitalAtRiskPaise} />
          ) : null}
          <StatCard
            label="Business Profit"
            paise={sold ? (asset.profitPaise ?? 0) : undefined}
            text={sold ? undefined : '— (once sold)'}
          />
          <StatCard
            label="My Profit"
            paise={sold ? (asset.mySharePaise ?? 0) : undefined}
            text={sold ? undefined : '— (once sold)'}
          />
          <StatCard
            label="Business ROI"
            text={
              sold && asset.businessRoiBps != null
                ? `${(asset.businessRoiBps / 100).toFixed(1)}%`
                : sold
                  ? '—'
                  : '— (once sold)'
            }
          />
          <StatCard
            label="My ROI"
            text={
              sold && asset.myRoiBps != null
                ? `${(asset.myRoiBps / 100).toFixed(1)}%`
                : sold
                  ? '—'
                  : '— (once sold)'
            }
          />
          <StatCard label="Outstanding" paise={asset.outstandingPaise} />
          <StatCard label="Holding days" text={String(asset.holdingDays ?? 0)} />
        </CardContent>
      </Card>

      {sold ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Sufii (operating partner)"
            paise={asset.operatingPartnerProfitPaise ?? asset.partnerSharePaise ?? 0}
          />
          <StatCard label="Investor Pool" paise={asset.investorProfitPoolPaise ?? 0} />
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
                  <th className="pb-2 pr-4 font-medium">Share %</th>
                  <th className="pb-2 pr-4 font-medium">Profit</th>
                  <th className="pb-2 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((inv) => {
                  const pct =
                    asset.totalInvestmentPaise > 0
                      ? ((inv.investedPaise / asset.totalInvestmentPaise) * 100).toFixed(0)
                      : '0';
                  return (
                    <tr key={inv.id} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-medium">{inv.label}</td>
                      <td className="py-2 pr-4">
                        <MoneyDisplay paise={inv.investedPaise} />
                      </td>
                      <td className="py-2 pr-4">{pct}%</td>
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
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {sold ? (
        <Card>
          <CardHeader>
            <CardTitle>Deal economics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <span className="text-ac-text-muted">Sale price</span>
              <MoneyDisplay paise={asset.actualSalePricePaise ?? 0} />
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <span className="text-ac-text-muted">Business profit</span>
              <MoneyDisplay paise={asset.profitPaise ?? 0} />
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <span className="text-ac-text-muted">Sufii (operating partner)</span>
              <MoneyDisplay
                paise={asset.operatingPartnerProfitPaise ?? asset.partnerSharePaise ?? 0}
              />
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <span className="text-ac-text-muted">Investor pool</span>
              <MoneyDisplay paise={asset.investorProfitPoolPaise ?? 0} />
            </div>
            <div className="flex justify-between gap-4 border-b border-white/5 py-2">
              <span className="text-ac-text-muted">My share</span>
              <MoneyDisplay paise={asset.mySharePaise ?? 0} />
            </div>
            {investors
              .filter((i) => i.slot !== 'me')
              .map((inv) => (
                <div
                  key={inv.id}
                  className="flex justify-between gap-4 border-b border-white/5 py-2"
                >
                  <span className="text-ac-text-muted">{inv.label} share</span>
                  <span>
                    {inv.profitPaise != null ? (
                      <MoneyDisplay paise={inv.profitPaise} />
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              ))}
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
          <Detail
            label="Fuel Type"
            value={auto.fuelType ? fuelLabels[auto.fuelType] ?? auto.fuelType : '—'}
          />
          <Detail label="Year" value={String(auto.year)} />
          <Detail
            label="Ownership"
            value={auto.ownership ? ownershipLabels[auto.ownership] ?? auto.ownership : '—'}
          />
          <Detail label="Purchase date" value={asset.purchaseDate} />
          <Detail
            label="Purchase price"
            value={<MoneyDisplay paise={asset.purchasePricePaise} />}
          />
        </CardContent>
      </Card>

      <AssetCommandCenter
        assetId={asset.id}
        currentStatus={asset.status}
        totalInvestmentPaise={asset.totalInvestmentPaise}
        fundingGapPaise={fundingGap}
        operatingPartnerNumerator={settings?.profitShareNumerator ?? 1}
        operatingPartnerDenominator={settings?.profitShareDenominator ?? 2}
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
