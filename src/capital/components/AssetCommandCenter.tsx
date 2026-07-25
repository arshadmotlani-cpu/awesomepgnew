'use client';

import Link from 'next/link';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/capital/components/ui/tabs';
import { AssetActionsForms } from '@/src/capital/components/forms/AssetActionsForms';
import { CreateActivityForm } from '@/src/capital/components/forms/CreateActivityForm';
import { DocumentUploadForm } from '@/src/capital/components/forms/DocumentUploadForm';
import { UpdateFundingForm } from '@/src/capital/components/forms/UpdateFundingForm';
import { VEHICLE_ACTIVITY_TYPE_META } from '@/src/capital/lib/activityTypes';
import { SetCoverPhotoButton } from '@/src/capital/components/forms/SetCoverPhotoButton';

type TimelineData = {
  vehicleActivities: {
    id: string;
    activityType: string;
    activityAt: string;
    amountPaise: number | null;
    title: string | null;
    notes: string | null;
    createdAt: Date;
  }[];
  activities: { id: string; action: string; createdAt: Date }[];
  ledger: {
    id: string;
    entryType: string;
    direction: string;
    description: string;
    amountPaise: number;
    createdAt: Date;
  }[];
  payments: { id: string; receivedAt: string; amountPaise: number; paymentType: string }[];
  documents: {
    id: string;
    fileName: string;
    documentType: string;
    fileSizeBytes: number;
    mimeType: string;
    isCover?: boolean;
  }[];
  openAdvances: {
    id: string;
    advancePaise: number;
    outstandingPaise: number;
  }[];
};

type OverviewData = {
  repairTotalPaise: number;
  dealerRefundTotalPaise: number;
  myInvestmentPaise: number;
  partnerInvestmentPaise: number;
  partnerLabel: string;
  capitalAtRiskPaise: number;
  outstandingPaise: number;
  holdingDays: number;
  purchaseDate: string;
  manufacturer: string;
  model: string;
  year: number;
  fuelLabel: string;
  ownershipLabel: string;
  isActive: boolean;
};

type ProfitData = {
  salePricePaise: number;
  businessProfitPaise: number;
  myProfitPaise: number;
  operatingPartnerPaise: number;
  investorPoolPaise: number;
  businessRoiBps: number | null;
  myRoiBps: number | null;
};

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

export function AssetCommandCenter({
  assetId,
  currentStatus,
  purchasePricePaise,
  totalInvestmentPaise,
  fundingGapPaise = 0,
  fundingStatus = '',
  operatingPartnerNumerator = 1,
  operatingPartnerDenominator = 2,
  timeline,
  investors = [],
  coverDocumentId,
  overview,
  profit,
}: {
  assetId: string;
  currentStatus: string;
  purchasePricePaise: number;
  totalInvestmentPaise: number;
  fundingGapPaise?: number;
  fundingStatus?: string;
  operatingPartnerNumerator?: number;
  operatingPartnerDenominator?: number;
  timeline: TimelineData;
  investors?: {
    slot: string;
    label: string;
    investedPaise: number;
    profitPaise?: number | null;
    roiBps?: number | null;
  }[];
  coverDocumentId?: string | null;
  overview: OverviewData;
  profit: ProfitData | null;
}) {
  const canEdit =
    currentStatus !== 'sold' &&
    currentStatus !== 'settled' &&
    currentStatus !== 'cancelled';

  const photos = timeline.documents.filter(
    (d) => d.documentType === 'photo' || d.mimeType.startsWith('image/'),
  );
  const docs = timeline.documents.filter(
    (d) => d.documentType !== 'photo' && !d.mimeType.startsWith('image/'),
  );

  return (
    <Tabs defaultValue="timeline" className="w-full">
      <TabsList className="mb-4 flex flex-wrap">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="timeline">
          Timeline ({timeline.vehicleActivities.length})
        </TabsTrigger>
        <TabsTrigger value="activities">Activities</TabsTrigger>
        <TabsTrigger value="investment">Investment</TabsTrigger>
        <TabsTrigger value="photos">Photos ({photos.length})</TabsTrigger>
        <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
        <TabsTrigger value="profit">Profit</TabsTrigger>
        <TabsTrigger value="sale">Sale</TabsTrigger>
        <TabsTrigger value="accounting">Accounting</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Purchase Price" paise={purchasePricePaise} />
          <StatCard label="Repairs / costs" paise={overview.repairTotalPaise} />
          <StatCard label="Refunds / Credits" paise={overview.dealerRefundTotalPaise} />
          <StatCard label="Net Vehicle Cost" paise={totalInvestmentPaise} />
          <StatCard label="Funding Status" text={fundingStatus || '—'} />
          <StatCard label="My Investment" paise={overview.myInvestmentPaise} />
          <StatCard label={overview.partnerLabel} paise={overview.partnerInvestmentPaise} />
          <StatCard label="Funding Gap" paise={fundingGapPaise} />
          {overview.isActive ? (
            <StatCard label="Capital at risk" paise={overview.capitalAtRiskPaise} />
          ) : null}
          <StatCard label="Outstanding" paise={overview.outstandingPaise} />
          <StatCard label="Holding days" text={String(overview.holdingDays)} />
        </div>
        <div className="ac-glass-card grid gap-2 p-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-white/5 py-2">
            <span className="text-ac-text-muted">Manufacturer</span>
            <span>{overview.manufacturer}</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 py-2">
            <span className="text-ac-text-muted">Model</span>
            <span>{overview.model}</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 py-2">
            <span className="text-ac-text-muted">Year</span>
            <span>{overview.year}</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 py-2">
            <span className="text-ac-text-muted">Fuel</span>
            <span>{overview.fuelLabel}</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 py-2">
            <span className="text-ac-text-muted">Ownership</span>
            <span>{overview.ownershipLabel}</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 py-2">
            <span className="text-ac-text-muted">Purchase date</span>
            <span>{overview.purchaseDate}</span>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="timeline" className="space-y-2">
        {timeline.vehicleActivities.map((a) => {
          const label =
            VEHICLE_ACTIVITY_TYPE_META[
              a.activityType as keyof typeof VEHICLE_ACTIVITY_TYPE_META
            ]?.label ?? a.activityType.replace(/_/g, ' ');
          return (
            <div key={a.id} className="ac-glass-card flex justify-between gap-4 p-3 text-sm">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{label}</Badge>
                  <span className="text-ac-text-muted">{a.activityAt}</span>
                </div>
                {a.title ? <p className="mt-1 font-medium">{a.title}</p> : null}
                {a.notes ? <p className="mt-0.5 text-ac-text-muted">{a.notes}</p> : null}
              </div>
              {a.amountPaise != null ? (
                <MoneyDisplay paise={a.amountPaise} />
              ) : (
                <span className="text-ac-text-muted">—</span>
              )}
            </div>
          );
        })}
        {timeline.vehicleActivities.length === 0 ? (
          <p className="text-sm text-ac-text-muted">No activities yet. Add the first one.</p>
        ) : null}
      </TabsContent>

      <TabsContent value="activities" className="space-y-4">
        {canEdit ? (
          <CreateActivityForm assetId={assetId} openAdvances={timeline.openAdvances} />
        ) : (
          <p className="text-sm text-ac-text-muted">This vehicle is closed — activities locked.</p>
        )}
        {timeline.openAdvances.length > 0 ? (
          <div className="ac-glass-card space-y-2 p-3 text-sm">
            <p className="font-medium">Open repair advances</p>
            {timeline.openAdvances.map((a) => (
              <div key={a.id} className="flex justify-between">
                <span>Advance</span>
                <MoneyDisplay paise={a.advancePaise} />
              </div>
            ))}
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="investment" className="space-y-4">
        {canEdit ? (
          <UpdateFundingForm
            assetId={assetId}
            purchasePricePaise={purchasePricePaise}
            fundingGapPaise={fundingGapPaise}
            investors={investors}
          />
        ) : (
          <p className="text-sm text-ac-text-muted">Funding locked on closed vehicles.</p>
        )}
        {investors.length > 0 ? (
          <div className="ac-glass-card overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-ac-text-muted">
                  <th className="pb-2 pr-4 font-medium">Investor</th>
                  <th className="pb-2 pr-4 font-medium">Invested</th>
                  <th className="pb-2 pr-4 font-medium">Share %</th>
                </tr>
              </thead>
              <tbody>
                {investors.map((inv) => {
                  const pct =
                    purchasePricePaise > 0
                      ? ((inv.investedPaise / purchasePricePaise) * 100).toFixed(0)
                      : '0';
                  return (
                    <tr key={inv.slot} className="border-b border-white/5">
                      <td className="py-2 pr-4 font-medium">{inv.label}</td>
                      <td className="py-2 pr-4">
                        <MoneyDisplay paise={inv.investedPaise} />
                      </td>
                      <td className="py-2 pr-4">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="photos" className="space-y-4">
        {canEdit ? (
          <DocumentUploadForm
            assets={[{ id: assetId, label: 'This vehicle' }]}
            defaultAssetId={assetId}
            forceDocumentType="photo"
          />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((d) => {
            const isCover = d.id === coverDocumentId || d.isCover;
            return (
              <div key={d.id} className="ac-glass-card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/capital/files/${d.id}`}
                  alt={d.fileName}
                  className="aspect-video w-full object-cover"
                />
                <div className="flex items-center justify-between gap-2 p-2 text-xs">
                  <span className="truncate">{d.fileName}</span>
                  {isCover ? (
                    <Badge variant="success">Cover</Badge>
                  ) : canEdit ? (
                    <SetCoverPhotoButton assetId={assetId} documentId={d.id} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-ac-text-muted">No photos yet.</p>
        ) : null}
      </TabsContent>

      <TabsContent value="documents" className="space-y-4">
        {canEdit ? (
          <DocumentUploadForm
            assets={[{ id: assetId, label: 'This vehicle' }]}
            defaultAssetId={assetId}
          />
        ) : null}
        {docs.map((d) => (
          <div key={d.id} className="ac-glass-card flex justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{d.fileName}</p>
              <Badge variant="secondary" className="mt-1">
                {d.documentType}
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-ac-text-muted">{(d.fileSizeBytes / 1024).toFixed(1)} KB</p>
              <Link href={`/api/capital/files/${d.id}`} className="text-ac-accent hover:underline">
                Download
              </Link>
            </div>
          </div>
        ))}
        {docs.length === 0 ? (
          <p className="text-sm text-ac-text-muted">No documents.</p>
        ) : null}
      </TabsContent>

      <TabsContent value="profit" className="space-y-4">
        {profit ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Sale price" paise={profit.salePricePaise} />
            <StatCard label="Business profit" paise={profit.businessProfitPaise} />
            <StatCard label="My profit" paise={profit.myProfitPaise} />
            <StatCard label="Sufii (operating partner)" paise={profit.operatingPartnerPaise} />
            <StatCard label="Investor pool" paise={profit.investorPoolPaise} />
            <StatCard
              label="Business ROI"
              text={
                profit.businessRoiBps != null
                  ? `${(profit.businessRoiBps / 100).toFixed(1)}%`
                  : '—'
              }
            />
            <StatCard
              label="My ROI"
              text={profit.myRoiBps != null ? `${(profit.myRoiBps / 100).toFixed(1)}%` : '—'}
            />
          </div>
        ) : (
          <p className="text-sm text-ac-text-muted">
            Profit summary is available after the vehicle is sold.
          </p>
        )}
      </TabsContent>

      <TabsContent value="sale" className="space-y-4">
        <AssetActionsForms
          assetId={assetId}
          currentStatus={currentStatus}
          totalInvestmentPaise={totalInvestmentPaise}
          fundingGapPaise={fundingGapPaise}
          operatingPartnerNumerator={operatingPartnerNumerator}
          operatingPartnerDenominator={operatingPartnerDenominator}
          investors={investors}
        />
      </TabsContent>

      <TabsContent value="accounting" className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium">Payments ({timeline.payments.length})</h3>
          <div className="space-y-2">
            {timeline.payments.map((p) => (
              <div key={p.id} className="ac-glass-card flex justify-between p-3 text-sm">
                <div>
                  <Badge variant="secondary">{p.paymentType}</Badge>
                  <p className="mt-1 text-ac-text-muted">{p.receivedAt}</p>
                </div>
                <MoneyDisplay paise={p.amountPaise} />
              </div>
            ))}
            {timeline.payments.length === 0 ? (
              <p className="text-sm text-ac-text-muted">No payments.</p>
            ) : null}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Ledger ({timeline.ledger.length})</h3>
          <div className="space-y-2">
            {timeline.ledger.map((l) => (
              <div key={l.id} className="ac-glass-card flex justify-between gap-4 p-3 text-sm">
                <div>
                  <Badge variant="outline">{l.entryType}</Badge>
                  <p className="mt-1 text-ac-text-secondary">{l.description}</p>
                </div>
                <div className="text-right">
                  <Badge variant={l.direction === 'credit' ? 'success' : 'warning'}>
                    {l.direction}
                  </Badge>
                  <p className="mt-1">
                    <MoneyDisplay paise={l.amountPaise} />
                  </p>
                </div>
              </div>
            ))}
            {timeline.ledger.length === 0 ? (
              <p className="text-sm text-ac-text-muted">No ledger entries.</p>
            ) : null}
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
