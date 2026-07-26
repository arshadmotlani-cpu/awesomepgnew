'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/capital/components/ui/tabs';
import { AssetActionsForms } from '@/src/capital/components/forms/AssetActionsForms';
import { CreateActivityForm } from '@/src/capital/components/forms/CreateActivityForm';
import { DocumentUploadForm } from '@/src/capital/components/forms/DocumentUploadForm';
import { EditActivityForm } from '@/src/capital/components/forms/EditActivityForm';
import { EditVehicleForm } from '@/src/capital/components/forms/EditVehicleForm';
import { InvestmentBudgetPanel } from '@/src/capital/components/forms/InvestmentBudgetPanel';
import { LifecycleControl } from '@/src/capital/components/forms/LifecycleControl';
import { RecordPurchasePaymentForm } from '@/src/capital/components/forms/RecordPurchasePaymentForm';
import { SetCoverPhotoButton } from '@/src/capital/components/forms/SetCoverPhotoButton';
import {
  VEHICLE_ACTIVITY_TYPE_META,
  isPaymentMilestoneType,
  remainingPurchasePaymentPaise,
  sumPaymentMilestonesPaise,
  type VehicleActivityType,
} from '@/src/capital/lib/activityTypes';
import {
  profitDistributionLabel,
  type ProfitDistributionMode,
} from '@/src/capital/lib/dealEconomics';
import {
  remainingPurchaseFromSellerPayments,
  sumSellerPaymentsPaise,
  SELLER_PAYMENT_KIND_LABELS,
} from '@/src/capital/lib/threeLedgers';
import { lifecycleLabel } from '@/src/capital/lib/vehicleLifecycle';
import type { SellerPaymentKind } from '@/src/capital/db/schema/sellerPayments';

type TimelineData = {
  vehicleActivities: {
    id: string;
    activityType: string;
    activityAt: string;
    amountPaise: number | null;
    title: string | null;
    notes: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: Date;
  }[];
  timelineEvents?: {
    id: string;
    kind: 'activity' | 'state';
    sortAt: string;
    activityAt?: string;
    activityType?: string;
    amountPaise?: number | null;
    title?: string | null;
    notes?: string | null;
    metadata?: unknown;
    action?: string;
    beforeState?: unknown;
    afterState?: unknown;
    createdAt: string;
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
  holdingDays: number;
  purchaseDate: string;
  manufacturer: string;
  model: string;
  year: number;
  fuelType: 'petrol' | 'diesel' | 'cng' | 'ev' | 'hybrid';
  fuelLabel: string;
  ownership: 'first_owner' | 'second_owner' | 'third_owner';
  ownershipLabel: string;
  registrationNumber: string;
  notes: string;
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
  profitDistributionMode: ProfitDistributionMode;
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

const TAB_VALUES = ['overview', 'work', 'sale', 'files'] as const;

function normalizeTab(initialTab: string | undefined): (typeof TAB_VALUES)[number] {
  if (!initialTab) return 'overview';
  if ((TAB_VALUES as readonly string[]).includes(initialTab)) {
    return initialTab as (typeof TAB_VALUES)[number];
  }
  if (initialTab === 'timeline' || initialTab === 'activities' || initialTab === 'notes') {
    return 'work';
  }
  if (initialTab === 'photos' || initialTab === 'documents') return 'files';
  if (initialTab === 'profit' || initialTab === 'payments' || initialTab === 'ledger') {
    return initialTab === 'profit' ? 'sale' : 'overview';
  }
  return 'overview';
}

export function AssetCommandCenter({
  assetId,
  currentStatus,
  purchasePricePaise,
  totalInvestmentPaise,
  expectedTotalInvestmentPaise = 0,
  sellerPricePaise = 0,
  currentInvestmentPaise = 0,
  budgetRemainingPaise = 0,
  buyerName = null,
  profitDistributionMode = null,
  timeline,
  coverDocumentId,
  overview,
  profit,
  initialTab,
  focusPayment = false,
  sellerPayments = [],
  vehicleCosts = [],
}: {
  assetId: string;
  currentStatus: string;
  purchasePricePaise: number;
  totalInvestmentPaise: number;
  expectedTotalInvestmentPaise?: number;
  sellerPricePaise?: number;
  currentInvestmentPaise?: number;
  budgetRemainingPaise?: number;
  buyerName?: string | null;
  /** Null until sale is recorded. */
  profitDistributionMode?: ProfitDistributionMode | null;
  timeline: TimelineData;
  coverDocumentId?: string | null;
  overview: OverviewData;
  profit: ProfitData | null;
  initialTab?: string;
  /** Highlight Seller Payments section after create. */
  focusPayment?: boolean;
  /** Seller payments ledger — preferred over activity milestones when present. */
  sellerPayments?: Array<{
    id: string;
    kind: string;
    paidAt: string;
    amountPaise: number;
    instrument: string | null;
    notes?: string | null;
  }>;
  vehicleCosts?: Array<{
    id: string;
    title: string | null;
    amountPaise: number;
    entryKind: string;
    occurredAt: string;
    notes?: string | null;
  }>;
}) {
  const defaultTab = normalizeTab(initialTab);
  const [tab, setTab] = useState<(typeof TAB_VALUES)[number]>(defaultTab);
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

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

  const activityMilestones = useMemo(
    () => timeline.vehicleActivities.filter((a) => isPaymentMilestoneType(a.activityType)),
    [timeline.vehicleActivities],
  );

  const useSellerLedger = sellerPayments.length > 0;
  const milestonePaidPaise = useSellerLedger
    ? sumSellerPaymentsPaise(sellerPayments)
    : sumPaymentMilestonesPaise(
        timeline.vehicleActivities.map((a) => ({
          activityType: a.activityType,
          amountPaise: a.amountPaise,
        })),
      );
  const purchaseRemainingPaise = useSellerLedger
    ? remainingPurchaseFromSellerPayments(sellerPricePaise || purchasePricePaise, milestonePaidPaise)
    : remainingPurchasePaymentPaise(sellerPricePaise || purchasePricePaise, milestonePaidPaise);

  const paymentMilestones = useSellerLedger
    ? sellerPayments.map((p) => ({
        id: p.id,
        activityType: p.kind,
        activityAt: p.paidAt,
        amountPaise: p.amountPaise,
        label:
          SELLER_PAYMENT_KIND_LABELS[p.kind as SellerPaymentKind] ??
          p.kind.replace(/_/g, ' '),
        instrument: p.instrument,
        notes: p.notes,
      }))
    : activityMilestones.map((a) => ({
        id: a.id,
        activityType: a.activityType,
        activityAt: a.activityAt,
        amountPaise: a.amountPaise,
        label: activityLabel(a.activityType),
        instrument:
          typeof a.metadata?.instrument === 'string' ? a.metadata.instrument : null,
      }));
  const timelineEvents =
    timeline.timelineEvents ??
    timeline.vehicleActivities.map((a) => ({
      id: `act-${a.id}`,
      kind: 'activity' as const,
      sortAt: `${a.activityAt}T12:00:00.000Z`,
      activityAt: a.activityAt,
      activityType: a.activityType,
      amountPaise: a.amountPaise,
      title: a.title,
      notes: a.notes,
      metadata: a.metadata,
      createdAt:
        a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    }));

  function activityLabel(type: string) {
    return (
      VEHICLE_ACTIVITY_TYPE_META[type as VehicleActivityType]?.label ??
      type.replace(/_/g, ' ')
    );
  }

  function stateEventLabel(ev: NonNullable<TimelineData['timelineEvents']>[number]) {
    if (ev.action === 'asset_created') return 'State → Just Purchased';
    if (ev.action === 'sale_recorded') return 'State → Sold';
    if (ev.action === 'settlement_created') return 'Settlement recorded';
    if (ev.action === 'asset_status_changed' && ev.afterState && typeof ev.afterState === 'object') {
      const status = (ev.afterState as { status?: string }).status;
      if (status) return `State → ${lifecycleLabel(status)}`;
    }
    return ev.action?.replace(/_/g, ' ') ?? 'State changed';
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(normalizeTab(v))}
      className="w-full"
    >
      <TabsList className="mb-4 flex flex-wrap">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="work">Work</TabsTrigger>
        <TabsTrigger value="sale">Sale</TabsTrigger>
        <TabsTrigger value="files">
          Files ({photos.length + docs.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <LifecycleControl
          assetId={assetId}
          currentStatus={currentStatus}
          purchasePricePaise={purchasePricePaise}
          milestonesPaidPaise={milestonePaidPaise}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Vehicle</h3>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setEditVehicleOpen((v) => !v)}
            >
              {editVehicleOpen ? 'Close edit' : 'Edit vehicle'}
            </Button>
          ) : null}
        </div>

        {editVehicleOpen && canEdit ? (
          <div className="ac-glass-card p-4">
            <EditVehicleForm
              assetId={assetId}
              defaults={{
                manufacturer: overview.manufacturer,
                model: overview.model,
                year: overview.year,
                fuelType: overview.fuelType,
                ownership: overview.ownership,
                registrationNumber: overview.registrationNumber,
                purchasePricePaise: sellerPricePaise || purchasePricePaise,
                purchaseDate: overview.purchaseDate,
                notes: overview.notes,
              }}
              onDone={() => setEditVehicleOpen(false)}
            />
          </div>
        ) : null}

        <InvestmentBudgetPanel
          assetId={assetId}
          expectedTotalInvestmentPaise={expectedTotalInvestmentPaise}
          sellerPricePaise={sellerPricePaise || purchasePricePaise}
          currentInvestmentPaise={currentInvestmentPaise || totalInvestmentPaise}
          budgetRemainingPaise={budgetRemainingPaise}
          costs={vehicleCosts}
          canEdit={canEdit}
        />

        <RecordPurchasePaymentForm
          assetId={assetId}
          purchasePricePaise={sellerPricePaise || purchasePricePaise}
          alreadyPaidPaise={milestonePaidPaise}
          remainingPaise={purchaseRemainingPaise}
          canEdit={canEdit}
          highlight={focusPayment}
          milestones={paymentMilestones}
        />

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
          <div className="flex justify-between gap-4 border-b border-white/5 py-2">
            <span className="text-ac-text-muted">Holding days</span>
            <span>{overview.holdingDays}</span>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="work" className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Purchase Activities</h3>
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
                  <span>Advance given</span>
                  <MoneyDisplay paise={a.advancePaise} />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Timeline ({timelineEvents.length})</h3>
          {timelineEvents.map((ev) => {
            if (ev.kind === 'state') {
              return (
                <div
                  key={ev.id}
                  className="ac-glass-card border-l-2 border-ac-accent/60 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{stateEventLabel(ev)}</Badge>
                    <span className="text-ac-text-muted">{ev.createdAt.slice(0, 10)}</span>
                  </div>
                </div>
              );
            }

            const activityId = ev.id.startsWith('act-') ? ev.id.slice(4) : ev.id;
            const full = timeline.vehicleActivities.find((a) => a.id === activityId);
            const meta = (ev.metadata ?? full?.metadata) as Record<string, unknown> | null | undefined;

            return (
              <div key={ev.id} className="ac-glass-card p-3 text-sm">
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{activityLabel(ev.activityType ?? '')}</Badge>
                      <span className="text-ac-text-muted">{ev.activityAt}</span>
                      {ev.activityType && isPaymentMilestoneType(ev.activityType) ? (
                        <Badge variant="outline">milestone</Badge>
                      ) : ev.activityType &&
                        VEHICLE_ACTIVITY_TYPE_META[ev.activityType as VehicleActivityType]
                          ?.costImpact === 'vehicle_cost' ? (
                        <Badge variant="outline">investment</Badge>
                      ) : null}
                    </div>
                    {ev.title ? <p className="mt-1 font-medium">{ev.title}</p> : null}
                    {ev.notes ? <p className="mt-0.5 text-ac-text-muted">{ev.notes}</p> : null}
                  </div>
                  <div className="text-right">
                    {ev.amountPaise != null ? (
                      <MoneyDisplay paise={ev.amountPaise} />
                    ) : (
                      <span className="text-ac-text-muted">—</span>
                    )}
                    {canEdit && full && full.activityType !== 'vehicle_created' ? (
                      <button
                        type="button"
                        className="mt-1 block text-xs text-ac-accent hover:underline"
                        onClick={() =>
                          setEditingActivityId((id) => (id === full.id ? null : full.id))
                        }
                      >
                        {editingActivityId === full.id ? 'Close' : 'Edit'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {full && editingActivityId === full.id ? (
                  <EditActivityForm
                    activity={full}
                    advancePaise={
                      typeof meta?.advancePaise === 'number' ? meta.advancePaise : undefined
                    }
                    onDone={() => setEditingActivityId(null)}
                  />
                ) : null}
              </div>
            );
          })}
          {timelineEvents.length === 0 ? (
            <p className="text-sm text-ac-text-muted">No timeline events yet.</p>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="files" className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Photos ({photos.length})</h3>
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
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Documents ({docs.length})</h3>
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
        </div>
      </TabsContent>

      <TabsContent value="sale" className="space-y-4">
        <AssetActionsForms
          assetId={assetId}
          currentStatus={currentStatus}
          purchasePricePaise={purchasePricePaise}
          totalInvestmentPaise={totalInvestmentPaise}
          profitDistributionMode={profitDistributionMode}
        />
        {profit ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Sale price" paise={profit.salePricePaise} />
            <StatCard label="Current Investment" paise={totalInvestmentPaise} />
            <StatCard label="Gross Deal Profit" paise={profit.businessProfitPaise} />
            <StatCard
              label="Profit Distribution"
              text={profitDistributionLabel(profit.profitDistributionMode)}
            />
            <StatCard label="My Profit (entitled)" paise={profit.myProfitPaise} />
            <StatCard label="Sufii Profit" paise={profit.operatingPartnerPaise} />
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
            Profit figures appear after you record a sale.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
