import Link from 'next/link';
import { ResidentPayElectricityClient } from '@/src/components/customer/account/resident/ResidentPayElectricityClient';
import { InvoiceBreakdownRow } from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import { StatusChip } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { ResidentElectricityBillCalculationPanel } from '@/src/components/customer/account/resident/ResidentElectricityBillCalculationPanel';
import { LateFeeCountdown } from '@/src/components/billing/LateFeeCountdown';
import { ViewBillDetailsCollapsible } from '@/src/components/billing/ViewBillDetailsCollapsible';
import { PaymentFlowErrorBoundary } from '@/src/components/customer/payments/PaymentFlowErrorBoundary';
import { residentTabHref } from '@/src/lib/accountNavigation';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { ResidentPayElectricityPageData } from '@/src/services/residentPayElectricityPage';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-800 ring-rose-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  partial: 'bg-amber-50 text-amber-800 ring-amber-200',
};

type Props = {
  data: ResidentPayElectricityPageData;
  previewMode?: boolean;
  backHref?: string;
  residentId?: string;
};

export function ResidentPayElectricityPageContent({
  data,
  previewMode = false,
  backHref,
  residentId,
}: Props) {
  const { invoice, projection, explanation, activeRejection } = data;
  const outstanding = projection.outstandingPaise;
  const amountLabel = paiseToInr(outstanding);
  const periodLabel = formatDate(invoice.billingMonth);
  const resolvedBackHref = backHref ?? residentTabHref('payments');
  const issueDate = invoice.createdAt ?? invoice.dueDate;
  const dueDateLabel = projection.graceEndDate ?? invoice.dueDate;
  const showCountdown =
    projection.effectiveStatus !== 'paid' && projection.effectiveStatus !== 'cancelled';

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      {previewMode ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Operator preview — this is what <strong>{data.customerFullName}</strong> sees on their
          electricity bill page.
        </div>
      ) : null}

      <header>
        {!previewMode ? (
          <Link href={resolvedBackHref} className={ACCOUNT_BACK_LINK}>
            ← Back to payments
          </Link>
        ) : null}
        <h1 className={`${previewMode ? '' : 'mt-2 '}${ACCOUNT_PAGE_TITLE}`}>Electricity invoice</h1>
      </header>

      <ApgCard tier="account" className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Your bill</h2>
          <StatusChip status={projection.effectiveStatus} toneMap={STATUS_TONE} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <InvoiceBreakdownRow label="Electricity" value={paiseToInr(invoice.amountPaise)} />
          {projection.accruedLateFeePaise > 0 ? (
            <InvoiceBreakdownRow
              label={`Late fee (${projection.lateFeePercent ?? projection.daysOverdue}%)`}
              value={`+${paiseToInr(projection.accruedLateFeePaise)}`}
              tone="danger"
            />
          ) : null}
          <InvoiceBreakdownRow label="Total to pay" value={amountLabel} emphasis />
          <InvoiceBreakdownRow label="Due date" value={formatDate(dueDateLabel)} />
        </dl>
        {showCountdown ? (
          <div className="mt-3">
            <LateFeeCountdown issueDate={issueDate} />
          </div>
        ) : null}
      </ApgCard>

      {explanation ? (
        <ResidentElectricityBillCalculationPanel explanation={explanation} theme="light" />
      ) : null}

      <ViewBillDetailsCollapsible>
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <InvoiceBreakdownRow label="Invoice ID" value={invoice.invoiceNumber} />
          <InvoiceBreakdownRow label="Billing period" value={periodLabel} />
          <InvoiceBreakdownRow
            label="Room / bed"
            value={`R${data.roomNumber} · ${data.bedCode}`}
          />
        </dl>
      </ViewBillDetailsCollapsible>

      {projection.effectiveStatus === 'paid' ? (
        <ApgCard tier="account" className="p-5 text-sm text-emerald-800">
          This invoice is already paid.
        </ApgCard>
      ) : projection.effectiveStatus === 'cancelled' ? (
        <ApgCard tier="account" className="p-5 text-sm text-zinc-700">
          This invoice was cancelled — no payment needed.
        </ApgCard>
      ) : (
        <PaymentFlowErrorBoundary
          page="resident-pay-electricity"
          invoiceId={invoice.id}
          bookingId={invoice.bookingId}
          residentId={residentId ?? invoice.customerId}
        >
          <ResidentPayElectricityClient
            invoiceId={invoice.id}
            amountLabel={amountLabel}
            confirmMessage={`You are paying ${amountLabel} for electricity for ${periodLabel}. Pay the exact amount via UPI, then upload your payment screenshot for verification.`}
            qrImageUrl={data.qrImageUrl}
            upiId={data.upiId}
            existingProofUrl={invoice.paymentProofUrl}
            rejectionReason={activeRejection?.reasonLabel ?? null}
            rejectionMessage={activeRejection?.residentMessage ?? null}
            rejectedAt={activeRejection?.rejectedAt ?? null}
            backHref={resolvedBackHref}
            residentId={residentId ?? invoice.customerId}
          />
        </PaymentFlowErrorBoundary>
      )}
    </div>
  );
}
