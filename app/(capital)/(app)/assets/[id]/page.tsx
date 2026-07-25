import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetCommandCenter } from '@/src/capital/components/AssetCommandCenter';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import { getAssetDetail, getAssetTimeline } from '@/src/capital/services/assets';
import { getSettings } from '@/src/capital/services/settings';
import { formatInrPlain } from '@/src/capital/lib/money';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getAssetDetail(id);
  if (!detail) return { title: 'Vehicle' };
  return { title: `${detail.asset.displayName} · Vehicles` };
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
  const myInvestmentPaise = me?.investedPaise ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start gap-5">
        {asset.coverDocumentId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/capital/files/${asset.coverDocumentId}`}
            alt={asset.displayName}
            className="h-28 w-40 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="flex h-28 w-40 shrink-0 items-center justify-center rounded-xl bg-white/5 text-xs text-ac-text-muted ring-1 ring-white/10">
            No cover photo
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{asset.displayName}</h1>
            <Badge>{asset.status}</Badge>
            <Badge variant={fundingGap === 0 ? 'success' : 'warning'}>{fundingStatus}</Badge>
          </div>
          <p className="text-lg font-medium tracking-wide text-ac-accent">
            {auto.registrationNumber || 'Registration pending'}
          </p>
          <p className="mt-1 text-sm text-ac-text-muted">
            {auto.year} · {fuelLabels[auto.fuelType ?? ''] ?? auto.fuelType ?? '—'} ·{' '}
            {ownershipLabels[auto.ownership ?? ''] ?? auto.ownership ?? '—'}
          </p>
        </div>
        <Link href="/assets">
          <Button variant="ghost">Back to vehicles</Button>
        </Link>
      </div>

      <AssetCommandCenter
        assetId={asset.id}
        currentStatus={asset.status}
        purchasePricePaise={asset.purchasePricePaise}
        totalInvestmentPaise={asset.totalInvestmentPaise}
        fundingGapPaise={fundingGap}
        fundingStatus={fundingStatus}
        operatingPartnerNumerator={settings?.profitShareNumerator ?? 1}
        operatingPartnerDenominator={settings?.profitShareDenominator ?? 2}
        timeline={timeline}
        coverDocumentId={asset.coverDocumentId}
        investors={investors.map((i) => ({
          slot: i.slot,
          label: i.label,
          investedPaise: i.investedPaise,
          profitPaise: i.profitPaise,
          roiBps: i.roiBps,
        }))}
        overview={{
          repairTotalPaise: asset.repairTotalPaise ?? 0,
          dealerRefundTotalPaise: asset.dealerRefundTotalPaise ?? 0,
          myInvestmentPaise,
          partnerInvestmentPaise: investor2?.investedPaise ?? 0,
          partnerLabel: investor2?.label ?? 'Partner Investment',
          capitalAtRiskPaise: isActive ? myInvestmentPaise : 0,
          outstandingPaise: asset.outstandingPaise,
          holdingDays: asset.holdingDays ?? 0,
          purchaseDate: asset.purchaseDate,
          manufacturer: auto.manufacturer,
          model: auto.model,
          year: auto.year,
          fuelLabel: fuelLabels[auto.fuelType ?? ''] ?? auto.fuelType ?? '—',
          ownershipLabel: ownershipLabels[auto.ownership ?? ''] ?? auto.ownership ?? '—',
          isActive,
        }}
        profit={
          sold
            ? {
                salePricePaise: asset.actualSalePricePaise ?? 0,
                businessProfitPaise: asset.profitPaise ?? 0,
                myProfitPaise: asset.mySharePaise ?? 0,
                operatingPartnerPaise:
                  asset.operatingPartnerProfitPaise ?? asset.partnerSharePaise ?? 0,
                investorPoolPaise: asset.investorProfitPoolPaise ?? 0,
                businessRoiBps: asset.businessRoiBps,
                myRoiBps: asset.myRoiBps,
              }
            : null
        }
      />
    </div>
  );
}
