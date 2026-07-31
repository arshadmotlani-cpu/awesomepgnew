import Link from 'next/link';
import { uploadPaymentScreenshotAction } from '@/app/(admin)/admin/pgs/payment-actions';
import { ResidentPayElectricityClient } from '@/src/components/customer/account/resident/ResidentPayElectricityClient';
import { InvoiceBreakdownRow } from '@/src/components/customer/account/resident/ResidentPaymentsHub';
import { StatusChip } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { ElectricityBillCalculationBreakdownPanel } from '@/src/components/billing/ElectricityBillCalculationBreakdownPanel';
import { PaymentFlowErrorBoundary } from '@/src/components/customer/payments/PaymentFlowErrorBoundary';
import { residentTabHref } from '@/src/lib/accountNavigation';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
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
  const { invoice, projection, calculation, activeRejection } = data;
  const outstanding = projection.outstandingPaise;
  const amountLabel = paiseToInr(outstanding);
  const periodLabel = formatDate(invoice.billingMonth);
  const resolvedBackHref = backHref ?? residentTabHref('payments');

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
        <p className={`font-mono ${ACCOUNT_PAGE_SUBTITLE}`}>{invoice.invoiceNumber}</p>
      </header>

      <ApgCard tier="account" className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Step 1 — Review</h2>
          <StatusChip status={projection.effectiveStatus} toneMap={STATUS_TONE} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <InvoiceBreakdownRow label="Period" value={periodLabel} />
          <InvoiceBreakdownRow label="Due date" value={formatDate(invoice.dueDate)} />
          <InvoiceBreakdownRow
            label="Room / bed"
            value={`R${data.roomNumber} · ${data.bedCode}`}
          />
          <InvoiceBreakdownRow
            label="Your share (principal)"
            value={paiseToInr(invoice.amountPaise)}
          />
          {projection.accruedLateFeePaise > 0 ? (
            <InvoiceBreakdownRow
              label={`Late fee (${projection.daysOverdue}d overdue)`}
              value={`+${paiseToInr(projection.accruedLateFeePaise)}`}
              tone="danger"
            />
          ) : null}
          <InvoiceBreakdownRow label="Total to pay" value={amountLabel} emphasis />
        </dl>
        {projection.effectiveStatus === 'overdue' ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Pay now to stop late fees from growing.
          </p>
        ) : null}
      </ApgCard>

      {calculation ? (
        <ElectricityBillCalculationBreakdownPanel
          breakdown={calculation.breakdown}
          viewer={calculation.viewer}
          theme="light"
        />
      ) : null}

      {invoice.status === 'paid' ? (
        <ApgCard tier="account" className="p-5 text-sm text-emerald-800">
          This invoice is already paid on {formatDate(invoice.paidAt)}.
        </ApgCard>
      ) : invoice.status === 'cancelled' ? (
        <ApgCard tier="account" className="p-5 text-sm text-zinc-700">
          This invoice was cancelled.
        </ApgCard>
      ) : previewMode ? (
        <ApgCard tier="account" className="p-5 text-sm text-zinc-600">
          Payment step (UPI QR + screenshot upload) is hidden in operator preview. Residents see
          this section when the invoice is unpaid.
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
            existingProofUrl={data.paymentProofUrl}
            rejectionReason={activeRejection?.reasonLabel ?? null}
            rejectionMessage={activeRejection?.residentMessage ?? null}
            rejectedAt={activeRejection?.rejectedAt ?? null}
            uploadScreenshot={uploadPaymentScreenshotAction}
            backHref={resolvedBackHref}
            residentId={residentId ?? invoice.customerId}
          />
        </PaymentFlowErrorBoundary>
      )}
    </div>
  );
}
