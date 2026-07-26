import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetCommandCenter } from '@/src/capital/components/AssetCommandCenter';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import { getAssetDetail, getAssetTimeline } from '@/src/capital/services/assets';
import { listSellerPayments } from '@/src/capital/services/sellerPayments';
import { listVehicleCosts } from '@/src/capital/services/vehicleCosts';
import { formatInrPlain, calcHoldingDays } from '@/src/capital/lib/money';
import { sumSellerPaymentsPaise } from '@/src/capital/lib/threeLedgers';
import { derivedBadges, lifecycleLabel } from '@/src/capital/lib/vehicleLifecycle';
import { sumPaymentMilestonesPaise } from '@/src/capital/lib/activityTypes';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const detail = await getAssetDetail(id);
  if (!detail) return { title: 'Vehicle' };
  return { title: `${detail.asset.displayName} · Vehicles` };
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AssetDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const detail = await getAssetDetail(id);
  if (!detail) notFound();

  const { asset, auto } = detail;
  const [timeline, sellerPaymentRows, vehicleCostRows] = await Promise.all([
    getAssetTimeline(id),
    listSellerPayments(id),
    listVehicleCosts(id),
  ]);
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

  const milestonesPaidPaise =
    sellerPaymentRows.length > 0
      ? sumSellerPaymentsPaise(sellerPaymentRows)
      : sumPaymentMilestonesPaise(
          timeline.vehicleActivities.map((a) => ({
            activityType: a.activityType,
            amountPaise: a.amountPaise,
          })),
        );
  const purchaseBadges = derivedBadges({
    status: asset.status,
    purchasePricePaise: asset.purchasePricePaise,
    milestonesPaidPaise,
  });

  const sold = asset.actualSalePricePaise != null;
  const isActive = !['sold', 'settled', 'cancelled'].includes(asset.status);

  const initialTabRaw = firstParam(sp.tab) ?? 'overview';
  const initialTab =
    initialTabRaw === 'accounting' || initialTabRaw === 'investment'
      ? initialTabRaw === 'accounting'
        ? 'ledger'
        : 'overview'
      : initialTabRaw;
  const focusPayment = firstParam(sp.focus) === 'payment';

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
            <Badge>{lifecycleLabel(asset.status)}</Badge>
            {purchaseBadges.map((b) => (
              <Badge key={b.id} variant="warning">
                {b.label}
              </Badge>
            ))}
          </div>
          <p className="text-lg font-medium tracking-wide text-ac-accent">
            {auto.registrationNumber || 'Registration pending'}
          </p>
          <p className="mt-1 text-sm text-ac-text-muted">
            {auto.year} · {fuelLabels[auto.fuelType ?? ''] ?? auto.fuelType ?? '—'} ·{' '}
            {ownershipLabels[auto.ownership ?? ''] ?? auto.ownership ?? '—'}
          </p>
          <p className="mt-2 text-sm text-ac-text-secondary">
            Current Investment:{' '}
            <span className="font-semibold text-ac-text">
              ₹{formatInrPlain(asset.currentInvestmentPaise ?? asset.totalInvestmentPaise)}
            </span>
            {asset.budgetRemainingPaise != null ? (
              <>
                {' '}
                · Budget remaining:{' '}
                <span className="font-semibold text-ac-text">
                  ₹{formatInrPlain(asset.budgetRemainingPaise)}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Link href="/assets">
          <Button variant="ghost">Back to vehicles</Button>
        </Link>
      </div>

      <AssetCommandCenter
        assetId={asset.id}
        currentStatus={asset.status}
        purchasePricePaise={asset.sellerPricePaise || asset.purchasePricePaise}
        totalInvestmentPaise={asset.currentInvestmentPaise || asset.totalInvestmentPaise}
        expectedTotalInvestmentPaise={asset.expectedTotalInvestmentPaise ?? 0}
        sellerPricePaise={asset.sellerPricePaise || asset.purchasePricePaise}
        currentInvestmentPaise={asset.currentInvestmentPaise || asset.totalInvestmentPaise}
        budgetRemainingPaise={asset.budgetRemainingPaise ?? 0}
        buyerName={asset.buyerName}
        profitDistributionMode={
          (asset.profitDistributionMode as 'SELF' | 'PARTNERSHIP_50_50' | null) ?? null
        }
        timeline={timeline}
        coverDocumentId={asset.coverDocumentId}
        initialTab={initialTab}
        focusPayment={focusPayment}
        sellerPayments={sellerPaymentRows.map((p) => ({
          id: p.id,
          kind: p.kind,
          paidAt: p.paidAt,
          amountPaise: p.amountPaise,
          instrument: p.instrument,
          notes: p.notes,
        }))}
        vehicleCosts={vehicleCostRows.map((c) => ({
          id: c.id,
          title: c.title,
          amountPaise: c.amountPaise,
          entryKind: c.entryKind,
          occurredAt: c.occurredAt,
          notes: c.notes,
        }))}
        overview={{
          repairTotalPaise: asset.repairTotalPaise ?? 0,
          dealerRefundTotalPaise: asset.dealerRefundTotalPaise ?? 0,
          holdingDays: calcHoldingDays(asset.purchaseDate, asset.saleDate),
          purchaseDate: asset.purchaseDate,
          manufacturer: auto.manufacturer,
          model: auto.model,
          year: auto.year,
          fuelType: (auto.fuelType ?? 'petrol') as
            | 'petrol'
            | 'diesel'
            | 'cng'
            | 'ev'
            | 'hybrid',
          fuelLabel: fuelLabels[auto.fuelType ?? ''] ?? auto.fuelType ?? '—',
          ownership: (auto.ownership ?? 'first_owner') as
            | 'first_owner'
            | 'second_owner'
            | 'third_owner',
          ownershipLabel: ownershipLabels[auto.ownership ?? ''] ?? auto.ownership ?? '—',
          registrationNumber: auto.registrationNumber ?? '',
          notes: asset.notes ?? '',
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
                profitDistributionMode:
                  (asset.profitDistributionMode as 'SELF' | 'PARTNERSHIP_50_50') ?? 'SELF',
              }
            : null
        }
      />
    </div>
  );
}
