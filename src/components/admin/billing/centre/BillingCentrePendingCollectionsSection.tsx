'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { FinancialRowActions } from '@/src/components/admin/FinancialRowActions';
import { BillingOperationsRowActions } from '@/src/components/admin/billing/BillingOperationsRowActions';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import type { BillingCentrePendingRow } from '@/src/lib/admin/billingCentreDashboardPresentation';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

type KindFilter = 'all' | 'rent' | 'electricity' | 'deposit';

const KIND_FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'rent', label: 'Rent' },
  { id: 'electricity', label: 'Electricity' },
  { id: 'deposit', label: 'Deposit' },
];

export function BillingCentrePendingCollectionsSection({
  rows,
  canMarkCash,
  adminName,
}: {
  rows: BillingCentrePendingRow[];
  canMarkCash: boolean;
  adminName: string;
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const filtered = useMemo(
    () => (kindFilter === 'all' ? rows : rows.filter((r) => r.kind === kindFilter)),
    [rows, kindFilter],
  );

  const totalPaise = filtered.reduce((s, r) => s + r.amountPaise, 0);

  return (
    <section id="pending-collections">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Pending collections</h2>
          <p className="mt-0.5 text-xs text-apg-silver">
            {filtered.length} items · {paiseToInr(totalPaise)} due
          </p>
        </div>
        <Link href="/admin/billing?tab=billing" className="text-xs font-medium text-[#FF5A1F] hover:underline">
          Full queue →
        </Link>
      </header>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setKindFilter(f.id)}
            className={
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition ' +
              (kindFilter === f.id
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 text-apg-silver hover:text-white')
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-5 text-sm text-emerald-100">
          No pending collections.
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
                <TH>Resident</TH>
                <TH>Room</TH>
                <TH>Invoice</TH>
                <TH>Due</TH>
                <TH>Overdue</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((row) => (
                <TR key={row.id}>
                  <TD className="text-[10px] uppercase text-apg-silver">{row.kind}</TD>
                  <TD className="min-w-0 max-w-[9rem]">
                    <Link
                      href={`/admin/residents/${row.customerId}`}
                      className="block truncate font-medium text-white hover:text-[#FF5A1F]"
                      title={row.customerName}
                    >
                      {row.customerName}
                    </Link>
                    <p className="truncate font-mono text-[10px] text-apg-silver">{row.customerPhone}</p>
                  </TD>
                  <TD className="text-xs whitespace-nowrap">
                    R{row.roomNumber}
                    {row.bedCode ? ` · ${row.bedCode}` : ''}
                  </TD>
                  <TD className="max-w-[7rem] truncate font-mono text-[10px]" title={row.invoiceNumber}>
                    {row.invoiceNumber}
                  </TD>
                  <TD className="text-xs whitespace-nowrap">{formatDate(row.dueDate)}</TD>
                  <TD className="text-xs tabular-nums">
                    {row.daysOverdue > 0 ? (
                      <span className="font-semibold text-rose-300">{row.daysOverdue}d</span>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="text-right tabular-nums font-semibold">{paiseToInr(row.amountPaise)}</TD>
                  <TD>
                    <Badge tone={toneForStatus(row.paymentStatus)}>
                      {titleCase(row.paymentStatus.replace(/_/g, ' '))}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {row.kind === 'rent' ? (
                      <BillingOperationsRowActions
                        customerId={row.customerId}
                        customerName={row.customerName}
                        phone={row.customerPhone}
                        pgId={row.pgId}
                        pgName={row.pgName}
                        roomNumber={row.roomNumber}
                        amountPaise={row.amountPaise}
                        dueDate={row.dueDate}
                        bookingId={row.bookingId}
                        financialInvoiceId={row.financialInvoiceId}
                        canMarkCash={canMarkCash}
                        adminName={adminName}
                        invoiceNumber={row.invoiceNumber}
                      />
                    ) : (
                      <FinancialRowActions
                        residentId={row.customerId}
                        residentName={row.customerName}
                        phone={row.customerPhone}
                        pgId={row.pgId}
                        pgName={row.pgName}
                        amountPaise={row.amountPaise}
                        purpose={row.kind === 'electricity' ? 'electricity' : 'deposit'}
                        dueDate={row.dueDate}
                        roomNumber={row.roomNumber}
                        isOverdue={row.daysOverdue > 0}
                        bookingId={row.bookingId}
                        financialInvoiceId={row.financialInvoiceId}
                      />
                    )}
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
