'use client';

import Link from 'next/link';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Badge } from '@/src/capital/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/capital/components/ui/tabs';
import { AssetActionsForms } from '@/src/capital/components/forms/AssetActionsForms';
import { UpdateFundingForm } from '@/src/capital/components/forms/UpdateFundingForm';

type TimelineData = {
  activities: { id: string; action: string; createdAt: Date }[];
  ledger: {
    id: string;
    entryType: string;
    direction: string;
    description: string;
    amountPaise: number;
    createdAt: Date;
  }[];
  expenses: { id: string; description: string; expenseDate: string; amountPaise: number }[];
  payments: { id: string; receivedAt: string; amountPaise: number; paymentType: string }[];
  documents: {
    id: string;
    fileName: string;
    documentType: string;
    fileSizeBytes: number;
  }[];
};

export function AssetCommandCenter({
  assetId,
  currentStatus,
  totalInvestmentPaise,
  fundingGapPaise = 0,
  operatingPartnerNumerator = 1,
  operatingPartnerDenominator = 2,
  timeline,
  investors = [],
}: {
  assetId: string;
  currentStatus: string;
  totalInvestmentPaise: number;
  fundingGapPaise?: number;
  operatingPartnerNumerator?: number;
  operatingPartnerDenominator?: number;
  timeline: TimelineData;
  investors?: { slot: string; label: string; investedPaise: number }[];
}) {
  const canEditFunding =
    currentStatus !== 'sold' &&
    currentStatus !== 'settled' &&
    currentStatus !== 'cancelled';

  return (
    <Tabs defaultValue="actions" className="w-full">
      <TabsList className="mb-4 flex flex-wrap">
        <TabsTrigger value="actions">Actions</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="expenses">Expenses ({timeline.expenses.length})</TabsTrigger>
        <TabsTrigger value="payments">Payments ({timeline.payments.length})</TabsTrigger>
        <TabsTrigger value="ledger">Ledger ({timeline.ledger.length})</TabsTrigger>
        <TabsTrigger value="documents">Documents ({timeline.documents.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="actions" className="space-y-4">
        {canEditFunding ? (
          <UpdateFundingForm
            assetId={assetId}
            netVehicleCostPaise={totalInvestmentPaise}
            fundingGapPaise={fundingGapPaise}
            investors={investors}
          />
        ) : null}
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

      <TabsContent value="timeline" className="space-y-2">
        {timeline.activities.map((a) => (
          <div key={a.id} className="ac-glass-card flex justify-between p-3 text-sm">
            <span>{a.action.replace(/_/g, ' ')}</span>
            <span className="text-ac-text-muted">{a.createdAt.toLocaleString('en-IN')}</span>
          </div>
        ))}
        {timeline.activities.length === 0 ? (
          <p className="text-sm text-ac-text-muted">No activity yet.</p>
        ) : null}
      </TabsContent>

      <TabsContent value="expenses" className="space-y-2">
        {timeline.expenses.map((e) => (
          <div key={e.id} className="ac-glass-card flex justify-between p-3 text-sm">
            <div>
              <p>{e.description}</p>
              <p className="text-ac-text-muted">{e.expenseDate}</p>
            </div>
            <MoneyDisplay paise={e.amountPaise} />
          </div>
        ))}
        {timeline.expenses.length === 0 ? (
          <p className="text-sm text-ac-text-muted">No expenses.</p>
        ) : null}
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

      <TabsContent value="documents" className="space-y-2">
        {timeline.documents.map((d) => (
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
        {timeline.documents.length === 0 ? (
          <p className="text-sm text-ac-text-muted">No documents.</p>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
