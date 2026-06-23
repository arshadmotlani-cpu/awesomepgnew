'use client';

import Link from 'next/link';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';
import {
  OpsPanel,
  OpsSection,
  ResidentAvatar,
} from '@/src/components/admin/residentOps/residentOpsUi';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(255,90,31,0.25)] transition hover:brightness-110';

export function ResidentsOperationsActionQueue({
  items,
  totalCount,
}: {
  items: ResidentsQueueRow[];
  totalCount: number;
}) {
  if (items.length === 0) {
    return (
      <OpsSection id="queue" title="Action queue">
        <OpsPanel className="border-emerald-400/25 bg-emerald-500/10 p-10 text-center">
          <p className="text-lg font-semibold text-emerald-100">Nothing needs attention</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-emerald-200/85">
            {totalCount === 0
              ? 'All residents are up to date for this filter.'
              : 'Try clearing the filter to see the full queue.'}
          </p>
        </OpsPanel>
      </OpsSection>
    );
  }

  return (
    <OpsSection
      id="queue"
      title="Action queue"
      description="One resident per row — payment proofs first, then KYC, beds, move-outs, and collections."
    >
      <OpsPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                {[
                  'Resident',
                  'PG / Room / Bed',
                  'Current state',
                  'Next required action',
                  'Owner',
                  'Age',
                  'Action',
                ].map((label) => (
                  <th
                    key={label}
                    className={
                      'px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-apg-silver ' +
                      (label === 'Action' ? 'text-right' : '')
                    }
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((row) => (
                <tr key={row.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ResidentAvatar name={row.residentName} />
                      {row.customerId ? (
                        <Link
                          href={`/admin/residents/${row.customerId}`}
                          className="font-semibold text-white hover:text-[#FF5A1F]"
                        >
                          {row.residentName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-white">{row.residentName}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-apg-silver">
                    <div>{row.pgName ?? '—'}</div>
                    <div className="text-xs text-apg-silver/80">
                      {row.roomNumber ? `R${row.roomNumber}` : '—'}
                      {row.bedCode ? ` · ${row.bedCode}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-white/90">{row.currentState}</td>
                  <td className="max-w-[220px] px-4 py-4 text-sm text-apg-silver">{row.nextAction}</td>
                  <td className="px-4 py-4 text-sm text-apg-silver">{row.owner}</td>
                  <td className="px-4 py-4 text-sm font-medium tabular-nums text-amber-200">
                    {row.ageLabel}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <QueueRowActions row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OpsPanel>
    </OpsSection>
  );
}

function QueueRowActions({ row }: { row: ResidentsQueueRow }) {
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
          <Link
            href="/admin/operations/payment-reviews"
            className="block px-4 py-2.5 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
          >
            Payment reviews
          </Link>
        </div>
      </details>
    </div>
  );
}
