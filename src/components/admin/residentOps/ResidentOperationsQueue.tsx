'use client';

import Link from 'next/link';
import type { ResidentOpsQueueItem } from '@/src/lib/residents/residentOperationsDashboard';
import {
  OpsPanel,
  OpsSection,
  ResidentAvatar,
} from '@/src/components/admin/residentOps/residentOpsUi';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(255,90,31,0.25)] transition hover:brightness-110';

export function ResidentOperationsQueue({
  items,
  selectedResidentId,
  filterQuery,
}: {
  items: ResidentOpsQueueItem[];
  selectedResidentId: string | null;
  filterQuery: string;
}) {
  if (items.length === 0) {
    return (
      <OpsSection id="queue" title="Priority action queue">
        <OpsPanel className="border-emerald-400/25 bg-emerald-500/10 p-10 text-center">
          <p className="text-lg font-semibold text-emerald-100">Nothing needs attention</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-emerald-200/85">
            All residents are up to date. Check Today&apos;s work or Advanced tools if you need
            something specific.
          </p>
        </OpsPanel>
      </OpsSection>
    );
  }

  return (
    <OpsSection
      id="queue"
      title="Priority action queue"
      description="One list across billing, KYC, beds, move-outs, and requests — sorted by urgency."
    >
      <OpsPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
                  Resident
                </th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
                  PG
                </th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
                  Room / bed
                </th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
                  Current issue
                </th>
                <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
                  Next required action
                </th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-apg-silver">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((row) => {
                const selected = selectedResidentId && row.customerId === selectedResidentId;
                return (
                  <tr
                    key={row.id}
                    className={
                      'transition hover:bg-white/[0.03] ' +
                      (selected ? 'bg-[#FF5A1F]/8' : '')
                    }
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <ResidentAvatar name={row.residentName} />
                        {row.customerId ? (
                          <Link
                            href={`?${filterQuery}resident=${row.customerId}#timeline`}
                            className="font-semibold text-white hover:text-[#FF5A1F]"
                          >
                            {row.residentName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-white">{row.residentName}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-apg-silver">{row.pgName ?? '—'}</td>
                    <td className="px-5 py-4 text-sm text-apg-silver">
                      {row.roomNumber ? `R${row.roomNumber}` : '—'}
                      {row.bedCode ? ` · ${row.bedCode}` : ''}
                    </td>
                    <td className="max-w-[180px] px-5 py-4">
                      <span className="inline-flex items-center gap-2 text-sm text-apg-silver">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-[#FF5A1F]"
                          aria-hidden
                        />
                        {row.issue}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-5 py-4 text-sm text-white/90">
                      {row.nextAction}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <QueueRowActions row={row} filterQuery={filterQuery} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </OpsPanel>
    </OpsSection>
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
        <summary className="cursor-pointer list-none rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-medium text-apg-silver transition hover:border-white/25 hover:bg-white/[0.06] hover:text-white marker:content-none [&::-webkit-details-marker]:hidden">
          More ▾
        </summary>
        <div className="absolute right-0 z-20 mt-1 min-w-[200px] rounded-xl border border-white/10 bg-[#1A1F27] py-1 shadow-2xl">
          {row.customerId ? (
            <Link
              href={`/admin/residents/${row.customerId}`}
              className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              Open resident profile
            </Link>
          ) : null}
          {row.customerId ? (
            <Link
              href={`?${filterQuery}resident=${row.customerId}#timeline`}
              className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              View lifecycle timeline
            </Link>
          ) : null}
          {row.bookingId ? (
            <Link
              href={`/admin/bookings/${row.bookingId}`}
              className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              Open booking
            </Link>
          ) : null}
          {row.kycSubmissionId ? (
            <Link
              href={`/admin/residents/kyc/${row.kycSubmissionId}`}
              className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              KYC workspace
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}
