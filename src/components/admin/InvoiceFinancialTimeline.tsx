import Link from 'next/link';
import { InvoiceAdminRowActions } from '@/src/components/admin/InvoiceAdminRowActions';
import { PipelineTestInvoiceBadge } from '@/src/components/admin/PipelineTestInvoiceBadge';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { FinancialTimelineEvent } from '@/src/services/invoiceCommandCenter';

const EVENT_LABELS: Record<FinancialTimelineEvent['eventType'], string> = {
  booking_rent_collected: 'Booking rent',
  booking_payment_uninvoiced: 'Rent not invoiced',
  deposit_collected: 'Deposit cash',
  deposit_transfer: 'Deposit transfer',
  prior_deposit_settled: 'Prior deposit',
  rent_paid: 'Rent',
  electricity_paid: 'Electricity',
  checkout_deduction: 'Checkout',
  refund_paid: 'Refund',
  invoice_generated: 'Invoice',
  invoice_paid: 'Paid',
  manual_adjustment: 'Adjustment',
  notice_deduction: 'Notice',
};

export function InvoiceFinancialTimeline({ events }: { events: FinancialTimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
        No financial events recorded for this day.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#1A1F27]">
      {events.map((event) => {
        const time = event.occurredAt.slice(11, 16);
        return (
          <li key={event.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-apg-silver">{time}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-apg-silver">
                  {EVENT_LABELS[event.eventType]}
                </span>
                <span className="text-sm text-white">{event.label}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs">
                <Link href={event.residentHref} className="text-[#FF5A1F] hover:underline">
                  {event.customerName}
                </Link>
                {event.invoiceHref ? (
                  <Link href={event.invoiceHref} className="text-apg-silver hover:text-white">
                    {event.invoiceNumber}
                  </Link>
                ) : null}
              </div>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-white">
              {paiseToInr(event.amountPaise)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function InvoiceDayList({
  invoices,
  selectedDate,
}: {
  selectedDate: string;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    customerName: string;
    amountPaise: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
    isPipelineTest?: boolean;
  }>;
}) {
  if (invoices.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
        No invoices created or paid on {formatDate(new Date(`${selectedDate}T00:00:00.000Z`))}.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#1A1F27]">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase text-apg-silver">
            <th className="px-4 py-3">Invoice #</th>
            <th className="px-4 py-3">Resident</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Paid</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className={
                inv.isPipelineTest
                  ? 'border-b border-amber-500/20 bg-amber-500/5 last:border-0'
                  : 'border-b border-white/5 last:border-0'
              }
            >
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/invoices/${inv.id}`} className="font-medium text-[#FF5A1F] hover:underline">
                    {inv.invoiceNumber}
                  </Link>
                  {inv.isPipelineTest ? <PipelineTestInvoiceBadge /> : null}
                </div>
              </td>
              <td className="px-4 py-3 text-white">{inv.customerName}</td>
              <td className="px-4 py-3 capitalize text-apg-silver">{inv.invoiceType}</td>
              <td className="px-4 py-3 text-right tabular-nums text-white">
                {inv.isPipelineTest ? (
                  <span className="text-amber-200">{paiseToInr(inv.amountPaise)}</span>
                ) : (
                  paiseToInr(inv.amountPaise)
                )}
              </td>
              <td className="px-4 py-3 capitalize text-apg-silver">{inv.status.replace(/_/g, ' ')}</td>
              <td className="px-4 py-3 text-apg-silver">
                {formatDate(new Date(inv.createdAt))}
              </td>
              <td className="px-4 py-3 text-apg-silver">
                {inv.paidAt ? formatDate(new Date(inv.paidAt)) : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                {(inv.invoiceType === 'rent' || inv.invoiceType === 'electricity') &&
                inv.status !== 'paid' &&
                inv.status !== 'cancelled' ? (
                  <InvoiceAdminRowActions financialInvoiceId={inv.id} />
                ) : (
                  <Link
                    href={`/admin/invoices/${inv.id}`}
                    className="text-xs text-apg-silver hover:text-white"
                  >
                    Open
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
