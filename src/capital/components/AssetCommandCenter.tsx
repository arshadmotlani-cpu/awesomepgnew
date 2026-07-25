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

export function AssetCommandCenter({
  assetId,
  currentStatus,
  purchasePricePaise,
  totalInvestmentPaise,
  fundingGapPaise = 0,
  operatingPartnerNumerator = 1,
  operatingPartnerDenominator = 2,
  timeline,
  investors = [],
  coverDocumentId,
}: {
  assetId: string;
  currentStatus: string;
  purchasePricePaise: number;
  totalInvestmentPaise: number;
  fundingGapPaise?: number;
  operatingPartnerNumerator?: number;
  operatingPartnerDenominator?: number;
  timeline: TimelineData;
  investors?: { slot: string; label: string; investedPaise: number }[];
  coverDocumentId?: string | null;
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
        <TabsTrigger value="timeline">
          Timeline ({timeline.vehicleActivities.length})
        </TabsTrigger>
        <TabsTrigger value="activities">Add Activity</TabsTrigger>
        <TabsTrigger value="investment">Investment</TabsTrigger>
        <TabsTrigger value="photos">Photos ({photos.length})</TabsTrigger>
        <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
        <TabsTrigger value="actions">Sale / Status</TabsTrigger>
        <TabsTrigger value="payments">Payments ({timeline.payments.length})</TabsTrigger>
        <TabsTrigger value="ledger">Ledger ({timeline.ledger.length})</TabsTrigger>
      </TabsList>

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
        <div className="ac-glass-card grid gap-2 p-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <span className="text-ac-text-muted">Purchase price</span>
            <MoneyDisplay paise={purchasePricePaise} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-ac-text-muted">Net vehicle cost</span>
            <MoneyDisplay paise={totalInvestmentPaise} />
          </div>
        </div>
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

      <TabsContent value="actions" className="space-y-4">
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

      <TabsContent value="payments" className="space-y-2">
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
      </TabsContent>

      <TabsContent value="ledger" className="space-y-2">
        {timeline.ledger.map((l) => (
          <div key={l.id} className="ac-glass-card flex justify-between gap-4 p-3 text-sm">
            <div>
              <Badge variant="outline">{l.entryType}</Badge>
              <p className="mt-1 text-ac-text-secondary">{l.description}</p>
            </div>
            <div className="text-right">
              <Badge variant={l.direction === 'credit' ? 'success' : 'warning'}>{l.direction}</Badge>
              <p className="mt-1">
                <MoneyDisplay paise={l.amountPaise} />
              </p>
            </div>
          </div>
        ))}
        {timeline.ledger.length === 0 ? (
          <p className="text-sm text-ac-text-muted">No ledger entries.</p>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
