'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ExpressCollectionButton } from '@/src/components/admin/ExpressCollectionButton';
import { BillingWhatsAppWithLinkButton } from '@/src/components/admin/BillingWhatsAppWithLinkButton';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  daysOverdueLabel,
  prioritySectionLabel,
  type CollectionPriority,
  type CollectionQueueItem,
} from '@/src/lib/billing/collectionsQueue';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110';

export function CollectionsActionQueue({ items }: { items: CollectionQueueItem[] }) {
  const grouped = useMemo(() => {
    const order: CollectionPriority[] = ['overdue', 'due_today', 'due_soon'];
    return order
      .map((priority) => ({
        priority,
        rows: items.filter((i) => i.priority === priority),
      }))
      .filter((g) => g.rows.length > 0);
  }, [items]);

  if (items.length === 0) {
    return (
      <section className="mb-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-emerald-100">No urgent collections</h2>
        <p className="mt-2 text-sm text-emerald-200/90">
          No overdue bills or bills due in the next 3 days. Check Advanced tools for bill creation
          or the Rent / Electricity tabs for the full list.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-white">Action queue</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Sorted for you — contact the first person, collect payment, move to the next.
        </p>
      </header>

      <div className="space-y-8">
        {grouped.map(({ priority, rows }) => (
          <div key={priority}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <span
                className={
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs ' +
                  (priority === 'overdue'
                    ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
                    : priority === 'due_today'
                      ? 'bg-[#FF5A1F]/20 text-orange-100 ring-1 ring-[#FF5A1F]/40'
                      : 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30')
                }
              >
                {prioritySectionLabel(priority)}
              </span>
              <span className="text-apg-silver">({rows.length})</span>
            </h3>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Resident</TH>
                    <TH>Room / bed</TH>
                    <TH>Bill</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Due date</TH>
                    <TH>Days overdue</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/admin/residents/${row.customerId}`}
                          className="font-medium text-white hover:text-[#FF5A1F]"
                        >
                          {row.customerFullName}
                        </Link>
                        <p className="font-mono text-[11px] text-apg-silver">{row.customerPhone}</p>
                      </TD>
                      <TD className="text-xs text-apg-silver">
                        R{row.roomNumber}
                        {row.bedCode ? ` · ${row.bedCode}` : ''}
                        <p className="text-[10px] text-apg-silver/80">{row.pgName}</p>
                      </TD>
                      <TD className="text-xs text-apg-silver">{row.invoiceLabel}</TD>
                      <TD className="text-right text-base font-semibold tabular-nums text-white">
                        {paiseToInr(row.amountPaise)}
                      </TD>
                      <TD className="text-xs">{formatDate(row.dueDate)}</TD>
                      <TD className="text-xs">
                        {row.daysOverdue > 0 ? (
                          <span className="font-semibold text-rose-300">
                            {daysOverdueLabel(row.daysOverdue)}
                          </span>
                        ) : (
                          <span className="text-apg-silver">—</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        <CollectionsQueueRowActions row={row} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CollectionsQueueRowActions({ row }: { row: CollectionQueueItem }) {
  const purpose = row.kind === 'electricity' ? 'electricity' : row.kind === 'rent' ? 'rent' : 'deposit';

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ExpressCollectionButton
        customerId={row.customerId}
        bookingId={row.bookingId}
        customerName={row.customerFullName}
        triggerClassName={PRIMARY}
        triggerLabel="Collect payment"
      />
      <details className="relative inline-block text-left">
        <summary className="cursor-pointer list-none rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-apg-silver hover:bg-white/5 hover:text-white marker:content-none [&::-webkit-details-marker]:hidden">
          More ▾
        </summary>
        <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-lg border border-white/10 bg-[#1A1F27] py-1 shadow-xl">
          <div className="px-2 py-1">
            <BillingWhatsAppWithLinkButton
              kind={purpose}
              residentId={row.customerId}
              pgId={row.pgId}
              customerName={row.customerFullName}
              phone={row.customerPhone}
              pgName={row.pgName}
              amountPaise={row.amountPaise}
              dueDate={row.dueDate}
              roomNumber={row.roomNumber}
              isOverdue={row.priority === 'overdue'}
              className="block w-full rounded-md px-2 py-2 text-left text-xs font-medium text-white hover:bg-white/5"
              label="Send payment request"
            />
          </div>
          <Link
            href={`/admin/residents/${row.customerId}`}
            className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
          >
            Open resident profile
          </Link>
          {row.bookingId ? (
            <Link
              href={`/admin/bookings/${row.bookingId}`}
              className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              Payment history
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}
