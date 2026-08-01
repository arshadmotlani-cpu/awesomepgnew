'use client';

import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import type { BillingRecentCollectionRow } from '@/src/lib/admin/billingCollectionsFilter';
import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';

export function BillingCentreRecentlyPaidSection({
  rows,
  paidPeriodLabel,
}: {
  rows: BillingRecentCollectionRow[];
  paidPeriodLabel: string;
}) {
  return (
    <section id="recently-paid">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Recently paid</h2>
          <p className="mt-0.5 text-xs text-apg-silver">
            {paidPeriodLabel} · rent and electricity payments
          </p>
        </div>
        <Link href="/admin/billing?tab=paid" className="text-xs font-medium text-[#FF5A1F] hover:underline">
          Full list →
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 px-4 py-5 text-sm text-apg-silver">
          No payments in this period.
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Resident</TH>
                <TH>Room</TH>
                <TH>Invoice</TH>
                <TH className="text-right">Amount</TH>
                <TH>Mode</TH>
                <TH>Status</TH>
                <TH>Paid on</TH>
              </TR>
            </THead>
            <TBody>
              {rows.slice(0, 20).map((row) => (
                <TR key={row.id}>
                  <TD className="min-w-0 max-w-[9rem]">
                    {row.customerId ? (
                      <Link
                        href={`/admin/residents/${row.customerId}`}
                        className="block truncate font-medium text-white hover:text-[#FF5A1F]"
                        title={row.customerFullName}
                      >
                        {row.customerFullName}
                      </Link>
                    ) : (
                      <span className="truncate">{row.customerFullName}</span>
                    )}
                  </TD>
                  <TD className="text-xs whitespace-nowrap">
                    R{row.roomNumber}
                    {row.bedCode ? ` · ${row.bedCode}` : ''}
                  </TD>
                  <TD className="max-w-[7rem] truncate font-mono text-[10px]">{row.invoiceNumber}</TD>
                  <TD className="text-right tabular-nums">{paiseToInr(row.amountPaise)}</TD>
                  <TD className="text-xs">{row.paymentMode ?? '—'}</TD>
                  <TD>
                    {row.paymentStatus ? (
                      <Badge tone={toneForStatus(row.paymentStatus)}>
                        {titleCase(row.paymentStatus.replace(/_/g, ' '))}
                      </Badge>
                    ) : (
                      <Badge tone="emerald">paid</Badge>
                    )}
                  </TD>
                  <TD className="text-xs whitespace-nowrap">
                    {row.paidAt ? formatDateTime(row.paidAt) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </section>
  );
}
