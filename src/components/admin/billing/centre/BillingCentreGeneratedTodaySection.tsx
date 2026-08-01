'use client';

import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import type { BillingCentreGeneratedTodayRow } from '@/src/lib/admin/billingCentreDashboardPresentation';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';

const KIND_LABEL: Record<BillingCentreGeneratedTodayRow['kind'], string> = {
  rent: 'Rent',
  electricity: 'Elec',
  deposit: 'Deposit',
};

export function BillingCentreGeneratedTodaySection({
  rows,
  totalPaise,
  todayIso,
}: {
  rows: BillingCentreGeneratedTodayRow[];
  totalPaise: number;
  todayIso: string;
}) {
  return (
    <section id="generated-today">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Bills generated today</h2>
          <p className="mt-0.5 text-xs text-apg-silver">
            Rent, electricity, and deposits for {formatDate(todayIso)} ·{' '}
            <span className="font-medium text-white">{paiseToInr(totalPaise)}</span> total
          </p>
        </div>
        <Link href="/admin/billing?tab=generated" className="text-xs font-medium text-[#FF5A1F] hover:underline">
          Full run →
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 px-4 py-5 text-sm text-apg-silver">
          No bills generated today yet.
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
                <TH>Resident / room</TH>
                <TH>PG</TH>
                <TH>Label</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH className="text-right">Open</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={`${row.kind}-${row.id}`}>
                  <TD>
                    <Badge tone={row.kind === 'rent' ? 'sky' : row.kind === 'electricity' ? 'amber' : 'violet'}>
                      {KIND_LABEL[row.kind]}
                    </Badge>
                  </TD>
                  <TD className="min-w-0">
                    {row.customerId ? (
                      <Link
                        href={`/admin/residents/${row.customerId}`}
                        className="block truncate font-medium text-white hover:text-[#FF5A1F]"
                        title={row.customerName}
                      >
                        {row.customerName}
                      </Link>
                    ) : (
                      <span className="truncate text-white">{row.customerName}</span>
                    )}
                    <p className="truncate text-[10px] text-apg-silver">R{row.roomNumber}</p>
                  </TD>
                  <TD className="max-w-[8rem] truncate text-xs text-apg-silver" title={row.pgName}>
                    {row.pgName}
                  </TD>
                  <TD className="max-w-[10rem] truncate font-mono text-[11px]" title={row.label}>
                    {row.label}
                  </TD>
                  <TD className="text-right tabular-nums font-medium">{paiseToInr(row.amountPaise)}</TD>
                  <TD>
                    <Badge tone={toneForStatus(row.paymentStatus)}>
                      {titleCase(row.paymentStatus.replace(/_/g, ' '))}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {row.openHref ? (
                      <Link href={row.openHref} className="text-[11px] font-medium text-[#FF5A1F] hover:underline">
                        Open
                      </Link>
                    ) : (
                      <span className="text-[10px] text-apg-silver">—</span>
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
