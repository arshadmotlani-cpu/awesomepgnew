'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  BILLING_COLLECTION_DATE_FILTERS,
  filterBillingCollectionsByDate,
  type BillingCollectionDateFilter,
  type BillingRecentCollectionRow,
} from '@/src/lib/admin/billingCollectionsFilter';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';

export function BillingRecentCollections({
  rows,
  error,
}: {
  rows: BillingRecentCollectionRow[];
  error: string | null;
}) {
  const [filter, setFilter] = useState<BillingCollectionDateFilter>('today');

  const filteredRows = useMemo(
    () => filterBillingCollectionsByDate(rows, filter).slice(0, 50),
    [rows, filter],
  );

  if (error) {
    return (
      <section className="mb-8">
        <header className="mb-4">
          <h2 className="text-lg font-bold text-white">Recent collections</h2>
        </header>
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      </section>
    );
  }

  if (rows.length === 0) return null;

  return (
    <section className="mb-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Recent collections</h2>
          <p className="mt-1 text-sm text-apg-silver">
            Rent and electricity payments recorded recently.
          </p>
        </div>
        <Link
          href="/admin/billing?tab=paid"
          className="text-sm font-semibold text-[#FF5A1F] hover:underline"
        >
          All paid bills →
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {BILLING_COLLECTION_DATE_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={
              'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
              (filter === option.id
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 text-apg-silver hover:text-white')
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <p className="rounded-xl border border-white/10 px-4 py-6 text-sm text-apg-silver">
          No collections for this period.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Resident</TH>
                <TH>Type</TH>
                <TH>PG · room · bed</TH>
                <TH className="text-right">Amount</TH>
                <TH>Payment mode</TH>
                <TH>Collected on</TH>
                <TH>Invoice</TH>
                <TH>Billing month</TH>
                <TH>Collected by</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {filteredRows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    {r.customerId ? (
                      <Link
                        href={`/admin/residents/${r.customerId}`}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
                        {r.customerFullName}
                      </Link>
                    ) : (
                      r.customerFullName
                    )}
                    <p className="font-mono text-[11px] text-apg-silver">{r.customerPhone}</p>
                  </TD>
                  <TD className="text-xs capitalize text-apg-silver">{r.kind}</TD>
                  <TD className="text-xs text-apg-silver">
                    {r.pgName} · R{r.roomNumber}
                    {r.bedCode ? ` · ${r.bedCode}` : ''}
                  </TD>
                  <TD className="text-right tabular-nums">{paiseToInr(r.amountPaise)}</TD>
                  <TD className="text-xs">{r.paymentMode ?? '—'}</TD>
                  <TD className="text-xs whitespace-nowrap">
                    {r.paidAt ? formatDateTime(r.paidAt) : '—'}
                  </TD>
                  <TD className="font-mono text-[11px]">{r.invoiceNumber}</TD>
                  <TD className="text-xs">{formatDate(r.billingMonth)}</TD>
                  <TD className="text-xs">{r.collectedBy ?? '—'}</TD>
                  <TD>
                    <Badge tone={toneForStatus(r.paymentStatus)}>
                      {titleCase(r.paymentStatus)}
                    </Badge>
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
