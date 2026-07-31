'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { posGlassCard } from '@/src/components/admin/expressBooking/expressBookingStyles';
import { BillingUpcomingRowActions } from '@/src/components/admin/billing/BillingUpcomingRowActions';
import {
  buildUpcomingGenerationSummaryKpis,
  sortUpcomingGenerationRows,
  upcomingGenerationStatusBadge,
  type BillingUpcomingGenerationRow,
  type UpcomingStatusTone,
} from '@/src/lib/admin/billingOperationsPresentation';
import { formatDate, paiseToInr } from '@/src/lib/format';

const STATUS_BADGE: Record<UpcomingStatusTone, string> = {
  red: 'bg-rose-500/20 text-rose-100 ring-rose-400/40',
  orange: 'bg-orange-500/20 text-orange-100 ring-orange-400/40',
  yellow: 'bg-amber-500/20 text-amber-100 ring-amber-400/40',
  blue: 'bg-sky-500/20 text-sky-100 ring-sky-400/40',
};

const ROW_TINT: Record<UpcomingStatusTone, string> = {
  red: 'bg-rose-500/[0.06]',
  orange: 'bg-orange-500/[0.05]',
  yellow: 'bg-amber-500/[0.04]',
  blue: 'bg-sky-500/[0.03]',
};

function SummaryCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'warn' | 'accent';
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-rose-300'
      : tone === 'accent'
        ? 'text-[#FF5A1F]'
        : 'text-white';

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#12161C]/90 px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums leading-none ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-apg-silver">{sub}</p> : null}
    </div>
  );
}

function StatusBadge({ issueDate, todayIso }: { issueDate: string; todayIso: string }) {
  const { label, tone } = upcomingGenerationStatusBadge(issueDate, todayIso);
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_BADGE[tone]}`}
    >
      {label}
    </span>
  );
}

export function BillingUpcomingGenerationSection({
  rows,
  todayIso,
  canGenerate,
}: {
  rows: BillingUpcomingGenerationRow[];
  todayIso: string;
  canGenerate: boolean;
}) {
  const sortedRows = useMemo(
    () => sortUpcomingGenerationRows(rows, todayIso),
    [rows, todayIso],
  );

  const summary = useMemo(
    () => buildUpcomingGenerationSummaryKpis(rows, todayIso),
    [rows, todayIso],
  );

  if (rows.length === 0) {
    return (
      <section className={`${posGlassCard} p-0`}>
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#12161C]/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex gap-2">
            <SummaryCard label="Bills today" value="0" tone="warn" />
            <SummaryCard label="Tomorrow" value="0" />
            <SummaryCard label="Next 7 days" value="0" />
            <SummaryCard label="Expected collection" value={paiseToInr(0)} tone="accent" />
          </div>
        </div>
        <p className="px-4 py-8 text-sm text-apg-silver">
          No upcoming bill generation in the next 7 days.
        </p>
      </section>
    );
  }

  return (
    <section className={`${posGlassCard} p-0`}>
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#12161C]/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex gap-2">
          <SummaryCard
            label="Bills today"
            value={String(summary.billsToday)}
            tone={summary.billsToday > 0 ? 'warn' : 'default'}
          />
          <SummaryCard label="Tomorrow" value={String(summary.tomorrow)} />
          <SummaryCard label="Next 7 days" value={String(summary.next7Days)} />
          <SummaryCard
            label="Expected collection"
            value={paiseToInr(summary.expectedCollectionPaise)}
            tone="accent"
          />
        </div>
      </div>

      <div className="overflow-hidden">
        <table className="w-full table-fixed text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
              <th className="w-[28%] px-3 py-2">Resident</th>
              <th className="w-[8%] px-2 py-2">Room</th>
              <th className="w-[12%] px-2 py-2">Generation</th>
              <th className="w-[12%] px-2 py-2 text-right">Rent</th>
              <th className="w-[12%] px-2 py-2 text-right">Outstanding</th>
              <th className="w-[16%] px-2 py-2">Status</th>
              <th className="w-[12%] px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const badge = upcomingGenerationStatusBadge(row.issueDate, todayIso);
              return (
                <tr
                  key={`${row.bookingId}-${row.issueDate}`}
                  className={`border-b border-white/5 hover:bg-white/[0.03] ${ROW_TINT[badge.tone]}`}
                >
                  <td className="px-3 py-2 align-middle">
                    <Link
                      href={`/admin/residents/${row.customerId}`}
                      className="block truncate font-medium text-white hover:text-[#FF5A1F]"
                      title={row.customerPhone ? `${row.customerName} · ${row.customerPhone}` : row.customerName}
                    >
                      {row.customerName}
                    </Link>
                    <p className="truncate text-[10px] text-apg-silver">
                      {row.pgName} · R{row.roomNumber} · {row.bedCode}
                    </p>
                  </td>
                  <td className="px-2 py-2 align-middle tabular-nums text-apg-silver">
                    R{row.roomNumber}
                  </td>
                  <td className="px-2 py-2 align-middle tabular-nums text-white">
                    {formatDate(row.issueDate)}
                  </td>
                  <td className="px-2 py-2 align-middle text-right tabular-nums font-medium text-white">
                    {paiseToInr(row.expectedRentPaise)}
                  </td>
                  <td className="px-2 py-2 align-middle text-right tabular-nums text-apg-silver">
                    {row.currentOutstandingPaise > 0
                      ? paiseToInr(row.currentOutstandingPaise)
                      : '—'}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <StatusBadge issueDate={row.issueDate} todayIso={todayIso} />
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <BillingUpcomingRowActions
                      bookingId={row.bookingId}
                      customerId={row.customerId}
                      customerName={row.customerName}
                      phone={row.customerPhone}
                      billingMonth={row.billingMonth}
                      issueDate={row.issueDate}
                      todayIso={todayIso}
                      expectedRentPaise={row.expectedRentPaise}
                      status={row.status}
                      canGenerate={canGenerate}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
