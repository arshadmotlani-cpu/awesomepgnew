'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import type { ResidentOpsQueueItem } from '@/src/lib/residents/residentOperationsDashboard';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110';

const CATEGORY_LABEL: Record<ResidentOpsQueueItem['category'], string> = {
  refund: 'Refund waiting',
  kyc: 'KYC waiting',
  bed_assignment: 'Bed assignment',
  payment_proof: 'Payment proof',
  resident_request: 'Resident request',
  rent_overdue: 'Rent overdue',
  move_out: 'Move-out',
};

export function ResidentOperationsQueue({
  items,
  selectedResidentId,
  filterQuery,
}: {
  items: ResidentOpsQueueItem[];
  selectedResidentId: string | null;
  filterQuery: string;
}) {
  const grouped = useMemo(() => {
    const order: ResidentOpsQueueItem['category'][] = [
      'refund',
      'kyc',
      'bed_assignment',
      'payment_proof',
      'resident_request',
      'rent_overdue',
      'move_out',
    ];
    return order
      .map((category) => ({
        category,
        rows: items.filter((i) => i.category === category),
      }))
      .filter((g) => g.rows.length > 0);
  }, [items]);

  if (items.length === 0) {
    return (
      <section
        id="queue"
        className="mb-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-8 text-center"
      >
        <h2 className="text-lg font-semibold text-emerald-100">Nothing needs attention</h2>
        <p className="mt-2 text-sm text-emerald-200/90">
          All residents are up to date. Check Today&apos;s work or Advanced tools if you need
          something specific.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8" id="queue">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-white">Priority action queue</h2>
        <p className="mt-1 text-sm text-apg-silver">
          One list across billing, KYC, beds, move-outs, and requests — sorted by urgency.
        </p>
      </header>

      <div className="space-y-8">
        {grouped.map(({ category, rows }) => (
          <div key={category}>
            <h3 className="mb-3 text-sm font-semibold text-white">
              {CATEGORY_LABEL[category]}
              <span className="ml-2 text-apg-silver">({rows.length})</span>
            </h3>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Resident</TH>
                    <TH>PG</TH>
                    <TH>Room / bed</TH>
                    <TH>Current issue</TH>
                    <TH>Next required action</TH>
                    <TH className="text-right">Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR
                      key={row.id}
                      className={
                        selectedResidentId && row.customerId === selectedResidentId
                          ? 'bg-[#FF5A1F]/10'
                          : undefined
                      }
                    >
                      <TD>
                        {row.customerId ? (
                          <Link
                            href={`?${filterQuery}resident=${row.customerId}#timeline`}
                            className="font-medium text-white hover:text-[#FF5A1F]"
                          >
                            {row.residentName}
                          </Link>
                        ) : (
                          <span className="font-medium text-white">{row.residentName}</span>
                        )}
                      </TD>
                      <TD className="text-xs text-apg-silver">{row.pgName ?? '—'}</TD>
                      <TD className="text-xs text-apg-silver">
                        {row.roomNumber ? `R${row.roomNumber}` : '—'}
                        {row.bedCode ? ` · ${row.bedCode}` : ''}
                      </TD>
                      <TD className="max-w-[200px] text-xs text-apg-silver">{row.issue}</TD>
                      <TD className="max-w-[200px] text-xs text-white">{row.nextAction}</TD>
                      <TD className="text-right">
                        <QueueRowActions row={row} filterQuery={filterQuery} />
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

function QueueRowActions({
  row,
  filterQuery,
}: {
  row: ResidentOpsQueueItem;
  filterQuery: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href={row.primaryHref} className={PRIMARY}>
        {row.primaryActionLabel}
      </Link>
      <details className="relative inline-block text-left">
        <summary className="cursor-pointer list-none rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-apg-silver hover:bg-white/5 hover:text-white marker:content-none [&::-webkit-details-marker]:hidden">
          More ▾
        </summary>
        <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-lg border border-white/10 bg-[#1A1F27] py-1 shadow-xl">
          {row.customerId ? (
            <Link
              href={`/admin/residents/${row.customerId}`}
              className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              Open resident profile
            </Link>
          ) : null}
          {row.customerId ? (
            <Link
              href={`?${filterQuery}resident=${row.customerId}#timeline`}
              className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              View lifecycle timeline
            </Link>
          ) : null}
          {row.bookingId ? (
            <Link
              href={`/admin/bookings/${row.bookingId}`}
              className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              Open booking
            </Link>
          ) : null}
          {row.kycSubmissionId ? (
            <Link
              href={`/admin/residents/kyc/${row.kycSubmissionId}`}
              className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              KYC workspace
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}
