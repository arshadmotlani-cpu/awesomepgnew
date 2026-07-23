'use client';

import Link from 'next/link';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { InvoiceDocumentModel } from '@/src/lib/billing/invoiceDocumentModel';
import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';
import { ElectricityBillCalculationBreakdownPanel } from '@/src/components/billing/ElectricityBillCalculationBreakdownPanel';
import { RentInvoiceBreakdownPanel } from '@/src/components/billing/RentInvoiceBreakdownPanel';
import { personalizeElectricityBreakdown } from '@/src/lib/billing/electricityBillBreakdownPure';
import {
  FinancialDocumentHeader,
  FinancialDocumentLineTable,
  FinancialDocumentMetaGrid,
  FinancialDocumentShell,
  FinancialDocumentTotals,
  type FinancialDocumentTotalRow,
} from '@/src/components/billing/FinancialDocumentLayout';
import { dividerClass, mutedClass } from '@/src/lib/billing/financialDocumentTheme';

type Variant = 'admin' | 'resident';

type Props = {
  document: InvoiceDocumentModel;
  variant?: Variant;
  className?: string;
};

const STATUS_STYLES: Record<
  FinancialInvoiceStatus | 'default',
  { badge: string; label: string }
> = {
  paid: {
    badge: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/40',
    label: 'Paid',
  },
  partial: {
    badge: 'bg-amber-500/15 text-amber-100 ring-amber-400/40',
    label: 'Partial',
  },
  sent: {
    badge: 'bg-amber-500/15 text-amber-100 ring-amber-400/40',
    label: 'Due',
  },
  overdue: {
    badge: 'bg-rose-500/15 text-rose-100 ring-rose-400/40',
    label: 'Overdue',
  },
  draft: {
    badge: 'bg-amber-500/15 text-amber-100 ring-amber-400/40',
    label: 'Due',
  },
  payment_in_progress: {
    badge: 'bg-sky-500/15 text-sky-100 ring-sky-400/40',
    label: 'Processing',
  },
  processing: {
    badge: 'bg-sky-500/15 text-sky-100 ring-sky-400/40',
    label: 'Processing',
  },
  settled: {
    badge: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/40',
    label: 'Settled',
  },
  cancelled: {
    badge: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/30',
    label: 'Cancelled',
  },
  refunded: {
    badge: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/30',
    label: 'Refunded',
  },
  expired: {
    badge: 'bg-rose-500/15 text-rose-100 ring-rose-400/40',
    label: 'Expired',
  },
  default: {
    badge: 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/30',
    label: 'Unknown',
  },
};

function statusStyle(status: FinancialInvoiceStatus) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.default;
}

function discountLabel(doc: InvoiceDocumentModel): string {
  if (!doc.totals.discountLabel) return 'Discount';
  if (doc.totals.discountLabel.startsWith('Referral')) return 'Referral discount';
  if (
    doc.totals.discountLabel.startsWith('Promo') ||
    doc.totals.discountLabel.startsWith('Daily')
  ) {
    return `Promo (${doc.totals.discountLabel.replace(/^Promo\s*/i, '')})`;
  }
  return `Discount (${doc.totals.discountLabel})`;
}

function buildTotalRows(doc: InvoiceDocumentModel): FinancialDocumentTotalRow[] {
  const rows: FinancialDocumentTotalRow[] = [
    { label: 'Subtotal', value: paiseToInr(doc.totals.subtotalPaise), tone: 'muted' },
  ];

  if (doc.totals.lateFeePaise > 0) {
    rows.push({
      label: 'Late fee',
      value: paiseToInr(doc.totals.lateFeePaise),
      tone: 'muted',
    });
  }

  if (doc.totals.discountPaise > 0) {
    rows.push({
      label: discountLabel(doc),
      value: `−${paiseToInr(doc.totals.discountPaise)}`,
      tone: 'deduct',
    });
    rows.push({
      label: 'You save',
      value: paiseToInr(doc.totals.discountPaise),
      tone: 'muted',
      size: 'sm',
    });
  }

  if (doc.totals.taxPaise != null && doc.totals.taxPaise > 0) {
    rows.push({
      label: doc.totals.taxLabel ?? 'Tax',
      value: paiseToInr(doc.totals.taxPaise),
      tone: 'muted',
    });
  }

  rows.push({
    label: 'Total',
    value: paiseToInr(doc.totals.totalPaise),
    tone: 'bold',
  });

  if (doc.totals.paidPaise > 0) {
    rows.push({
      label: 'Paid',
      value: paiseToInr(doc.totals.paidPaise),
      tone: 'positive',
    });
  }

  rows.push({
    label: 'Balance due',
    value: paiseToInr(doc.totals.balanceDuePaise),
    tone: 'accent',
  });

  return rows;
}

export function InvoiceDocument({ document: doc, variant = 'admin', className = '' }: Props) {
  const status = statusStyle(doc.status);
  const surface = variant === 'resident' ? 'resident' : 'adminPage';
  const muted = mutedClass(surface);
  const divider = dividerClass(surface);

  const badge = (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${status.badge}`}
    >
      {status.label || titleCase(doc.status)}
    </span>
  );

  return (
    <FinancialDocumentShell
      surface={surface}
      ariaLabel={`Invoice ${doc.invoiceNumber}`}
      className={className}
    >
      <FinancialDocumentHeader
        surface={surface}
        letterhead={doc.letterhead}
        docTitle="Tax Invoice"
        docNumber={doc.invoiceNumber}
        issuedAt={doc.issuedAt}
        secondaryDate={doc.dueDate ? formatDate(doc.dueDate) : null}
        badge={badge}
      />

      <FinancialDocumentMetaGrid
        surface={surface}
        left={{
          title: 'Bill to',
          children: (
            <>
              <p className="font-semibold">{doc.customerName}</p>
              <p className={`text-xs ${muted}`}>{doc.customerPhone}</p>
              {doc.customerEmail ? <p className={`text-xs ${muted}`}>{doc.customerEmail}</p> : null}
              {doc.roomNumber || doc.bedCode ? (
                <p className={`mt-2 text-xs ${muted}`}>
                  {[doc.roomNumber ? `Room ${doc.roomNumber}` : null, doc.bedCode ? `Bed ${doc.bedCode}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
              {doc.bookingCode ? <p className={`text-xs ${muted}`}>Booking {doc.bookingCode}</p> : null}
            </>
          ),
        }}
        right={
          doc.stayDates
            ? {
                title: 'Stay',
                children: (
                  <>
                    <p className="font-medium">{doc.stayDates.displayLabel}</p>
                    {doc.stayDates.isOpenEnded ? (
                      <p className={`mt-1 text-xs ${muted}`}>Continue living (open-ended)</p>
                    ) : doc.stayDates.checkIn && doc.stayDates.checkOut ? (
                      <dl className={`mt-2 space-y-1 text-xs ${muted}`}>
                        <div className="flex justify-between gap-4">
                          <dt>Check-in</dt>
                          <dd>{doc.stayDates.checkIn}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>Check-out</dt>
                          <dd>{doc.stayDates.checkOut}</dd>
                        </div>
                      </dl>
                    ) : null}
                    {doc.stayDates.noticeNote ? (
                      <p className={`mt-2 text-xs italic ${muted}`}>{doc.stayDates.noticeNote}</p>
                    ) : null}
                    {doc.stayDates.stayPeriodNote ? (
                      <p className={`mt-2 text-xs italic ${muted}`}>{doc.stayDates.stayPeriodNote}</p>
                    ) : null}
                    {doc.stayDates.stayPeriodNote ? (
                      <p className={`mt-2 text-xs italic ${muted}`}>{doc.stayDates.stayPeriodNote}</p>
                    ) : null}
                  </>
                ),
              }
            : null
        }
      />

      <FinancialDocumentLineTable
        surface={surface}
        rows={doc.lineItems.map((line, i) => ({
          key: `${line.kind}-${i}`,
          label: line.label,
          subtitle: line.subtitle,
          period: line.period,
          amount: paiseToInr(line.amountPaise),
        }))}
        emptyMessage={`${titleCase(doc.invoiceType.replace(/_/g, ' '))} — ${paiseToInr(doc.totals.totalPaise)}`}
      />

      {doc.rentCalculationBreakdown ? (
        <section className="mt-6 print:break-inside-avoid">
          <RentInvoiceBreakdownPanel
            breakdown={doc.rentCalculationBreakdown}
            theme={variant === 'resident' ? 'light' : 'dark'}
          />
        </section>
      ) : null}

      {doc.electricityCalculationBreakdown ? (
        <section className="mt-6 print:break-inside-avoid">
          <ElectricityBillCalculationBreakdownPanel
            breakdown={doc.electricityCalculationBreakdown}
            viewer={(() => {
              const personalized = personalizeElectricityBreakdown(
                doc.electricityCalculationBreakdown,
                doc.customerId,
              );
              if (personalized.viewer) {
                personalized.viewer.amountPayablePaise =
                  doc.totals.balanceDuePaise > 0
                    ? doc.totals.balanceDuePaise
                    : personalized.viewer.amountPayablePaise;
              }
              return personalized.viewer;
            })()}
            theme={variant === 'resident' ? 'light' : 'dark'}
          />
        </section>
      ) : null}

      <FinancialDocumentTotals surface={surface} rows={buildTotalRows(doc)} />

      {doc.bookingPaymentSummary ? (
        <section className={`mt-6 border-t pt-6 ${divider}`}>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
            Booking payment summary
          </h2>
          <p className={`mt-1 text-xs ${muted}`}>
            Every rupee from checkout is accounted for — rent applied to invoice, deposit held,
            and any advance credit toward future rent.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4 font-medium">
              <dt>Booking payment received</dt>
              <dd className="tabular-nums">
                {paiseToInr(doc.bookingPaymentSummary.totalPaymentPaise)}
              </dd>
            </div>
          </dl>
          <h3 className={`mt-4 text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
            Allocated
          </h3>
          <dl className="mt-2 space-y-2 text-sm">
            {(doc.bookingPaymentSummary?.allocationLines ?? []).map((line) => (
              <div key={line.key} className="flex justify-between gap-4">
                <dt className={muted}>{line.label}</dt>
                <dd className="tabular-nums">{paiseToInr(line.amountPaise)}</dd>
              </div>
            ))}
            <div className={`flex justify-between gap-4 border-t pt-2 font-semibold ${divider}`}>
              <dt>Total allocated</dt>
              <dd className="tabular-nums">
                {paiseToInr(doc.bookingPaymentSummary.totalAllocatedPaise)}
              </dd>
            </div>
            {doc.bookingPaymentSummary.advanceRentCreditPaise > 0 ? (
              <p className={`text-xs ${muted}`}>
                Advance rent credit (₹
                {(doc.bookingPaymentSummary.advanceRentCreditPaise / 100).toLocaleString('en-IN')})
                is stored on the booking and applies toward future monthly rent invoices.
              </p>
            ) : null}
            <div className={`flex justify-between gap-4 border-t pt-2 font-medium ${divider}`}>
              <dt>Current refundable deposit held</dt>
              <dd className="tabular-nums">
                {paiseToInr(doc.bookingPaymentSummary.currentDepositHeldPaise)}
              </dd>
            </div>
          </dl>
          <p className={`mt-3 text-xs ${muted}`}>
            Deposit may be refunded at checkout after electricity, damage, notice, and other
            approved deductions.
          </p>
        </section>
      ) : null}

      {(doc.payment.paymentMode ||
        doc.payment.paymentReference ||
        doc.payment.paymentLinkUrl ||
        doc.status === 'paid') && (
        <section className={`mt-6 border-t pt-6 ${divider}`}>
          <h2 className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Payment</h2>
          {doc.status === 'paid' && doc.payment.paymentMode ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className={muted}>Mode</dt>
                <dd>{doc.payment.paymentMode}</dd>
              </div>
              {doc.payment.paidAt ? (
                <div className="flex justify-between gap-4">
                  <dt className={muted}>Collected on</dt>
                  <dd>{doc.payment.paidAt}</dd>
                </div>
              ) : null}
              {doc.payment.collectedByName ? (
                <div className="flex justify-between gap-4">
                  <dt className={muted}>Collected by</dt>
                  <dd>{doc.payment.collectedByName}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {doc.payment.paymentReference ? (
            <p className="mt-2 text-sm">
              Reference: <span className="font-mono text-xs">{doc.payment.paymentReference}</span>
              {doc.payment.paidAt && !doc.payment.paymentMode ? (
                <span className={`ml-2 text-xs ${muted}`}>· Paid {doc.payment.paidAt}</span>
              ) : null}
            </p>
          ) : null}
          {doc.payment.paymentLinkUrl && doc.totals.balanceDuePaise > 0 ? (
            <p className="mt-2 text-sm">
              Pay via UPI:{' '}
              <Link
                href={doc.payment.paymentLinkUrl}
                target="_blank"
                className="break-all font-medium text-[#FF5A1F] hover:underline print:text-zinc-900"
              >
                {doc.payment.paymentLinkUrl}
              </Link>
            </p>
          ) : null}
        </section>
      )}

      {doc.notes ? (
        <footer className={`mt-6 border-t pt-4 text-xs ${divider} ${muted}`}>
          <p className="font-medium">Notes</p>
          <p className="mt-1">{doc.notes}</p>
        </footer>
      ) : null}

      {doc.cancellationReason ? (
        <footer className={`mt-4 text-xs ${muted}`}>
          Cancellation reason: {doc.cancellationReason}
        </footer>
      ) : null}
    </FinancialDocumentShell>
  );
}
