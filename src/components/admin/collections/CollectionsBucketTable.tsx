import Link from 'next/link';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { collectionsBucketLabel, type CollectionsBucket } from '@/src/lib/collections/invoiceLifecycleLabel';
import type { CollectionsQueueRow } from '@/src/services/collectionsDashboard';

export function CollectionsBucketTable({
  bucket,
  rows,
  canRemind,
  canWrite,
}: {
  bucket: CollectionsBucket;
  rows: CollectionsQueueRow[];
  canRemind?: boolean;
  canWrite?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-8 text-center">
        <p className="text-sm text-apg-silver">No items in {collectionsBucketLabel(bucket)}.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <Table>
        <THead>
          <TR>
            <TH>Resident</TH>
            <TH>Room</TH>
            <TH>Bill date</TH>
            <TH className="text-right">Amount</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const invoiceHref = row.financialInvoiceId
              ? `/admin/invoices/${row.financialInvoiceId}`
              : row.sourceId
                ? `/admin/collections/pg/${row.pgId}/resident/${row.customerId}`
                : `/admin/residents/${row.customerId}`;
            const waText = encodeURIComponent(
              `Hi ${row.customerFullName}, reminder from ${row.pgName}: ₹${(row.amountPaise / 100).toFixed(0)} due ${row.dueDate}.`,
            );
            const phoneDigits = row.customerPhone.replace(/\D/g, '').replace(/^0+/, '');
            const waHref =
              phoneDigits.length >= 10
                ? `https://wa.me/${phoneDigits.startsWith('91') ? phoneDigits : `91${phoneDigits.slice(-10)}`}?text=${waText}`
                : null;

            return (
              <TR key={row.id}>
                <TD>
                  <Link
                    href={`/admin/residents/${row.customerId}`}
                    className="font-medium text-white hover:text-[#FF5A1F]"
                  >
                    {row.customerFullName}
                  </Link>
                  <div className="text-xs text-apg-silver">{row.pgName}</div>
                </TD>
                <TD className="text-apg-silver">
                  {row.roomNumber}
                  {row.bedCode ? ` · ${row.bedCode}` : ''}
                </TD>
                <TD className="tabular-nums text-apg-silver">{formatDate(row.dueDate)}</TD>
                <TD className="text-right tabular-nums text-white">{paiseToInr(row.amountPaise)}</TD>
                <TD>
                  <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs text-white">
                    {row.lifecycleLabel}
                  </span>
                </TD>
                <TD className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={invoiceHref}
                      className="inline-flex min-h-[32px] items-center rounded-lg border border-white/15 px-2.5 text-xs text-white hover:bg-white/5"
                    >
                      {row.kind === 'upcoming' ? 'Open resident' : 'Open invoice'}
                    </Link>
                    {canRemind && waHref && bucket !== 'paid_today' ? (
                      <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[32px] items-center rounded-lg bg-[#25D366]/20 px-2.5 text-xs font-medium text-emerald-200 ring-1 ring-[#25D366]/30 hover:brightness-110"
                      >
                        Remind
                      </a>
                    ) : null}
                    {canWrite && bucket === 'awaiting' ? (
                      <Link
                        href="/admin/operations?filter=waiting_for_approval"
                        className="inline-flex min-h-[32px] items-center rounded-lg bg-[#FF5A1F] px-2.5 text-xs font-semibold text-white hover:brightness-110"
                      >
                        View proof
                      </Link>
                    ) : null}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
