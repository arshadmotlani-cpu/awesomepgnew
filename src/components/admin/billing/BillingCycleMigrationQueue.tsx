'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BillingCycleMigrationPanel } from '@/src/components/admin/residents/BillingCycleMigrationPanel';
import type { BillingCycleMigrationPreview } from '@/src/services/billingCycleMigration';
import type {
  BillingCycleMigrationCandidateRow,
  BillingCycleMigrationStatus,
} from '@/src/services/billingCycleMigrationCandidates';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';

type Filter = 'needs_migration' | 'all' | 'blocked' | 'already_on_1st';

function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function statusLabel(status: BillingCycleMigrationStatus): string {
  switch (status) {
    case 'eligible':
      return 'Needs migration';
    case 'already_on_1st':
      return 'On 1st';
    case 'migrated':
      return 'Migrated';
    case 'blocked':
      return 'Blocked';
    default:
      return status;
  }
}

export function BillingCycleMigrationQueue({
  candidates,
  previewsByBookingId,
}: {
  candidates: BillingCycleMigrationCandidateRow[];
  previewsByBookingId: Record<string, BillingCycleMigrationPreview>;
}) {
  const [filter, setFilter] = useState<Filter>('needs_migration');
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'needs_migration':
        return candidates.filter((c) => c.migrationStatus === 'eligible');
      case 'blocked':
        return candidates.filter((c) => c.migrationStatus === 'blocked');
      case 'already_on_1st':
        return candidates.filter(
          (c) => c.migrationStatus === 'already_on_1st' || c.migrationStatus === 'migrated',
        );
      default:
        return candidates;
    }
  }, [candidates, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, BillingCycleMigrationCandidateRow[]>();
    for (const row of filtered) {
      const bucket = map.get(row.pgName) ?? [];
      bucket.push(row);
      map.set(row.pgName, bucket);
    }
    return map;
  }, [filtered]);

  const expandedPreview =
    expandedBookingId ? previewsByBookingId[expandedBookingId] : undefined;
  const expandedCandidate = candidates.find((c) => c.bookingId === expandedBookingId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['needs_migration', 'Needs migration'],
            ['blocked', 'Blocked'],
            ['already_on_1st', 'Already on 1st'],
            ['all', 'All'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? 'rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white'
                : 'rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:bg-white/5'
            }
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-sm text-apg-silver">
        {filtered.length} resident{filtered.length === 1 ? '' : 's'} · Review individually — no
        automatic migration.
      </p>

      {Array.from(grouped.entries()).map(([pgName, rows]) => (
        <section key={pgName} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-silver">
            {pgName} ({rows.length})
          </h2>
          <Table>
            <THead>
              <TR>
                <TH>Resident</TH>
                <TH>Room / Bed</TH>
                <TH>Check-in</TH>
                <TH>Cycle</TH>
                <TH>Rent</TH>
                <TH>Paid through</TH>
                <TH>Outstanding</TH>
                <TH>Transition</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.bookingId}>
                  <TD>
                    <Link
                      href={row.residentHref}
                      className="font-medium text-white hover:text-[#FF5A1F]"
                    >
                      {row.customerName}
                    </Link>
                  </TD>
                  <TD className="text-apg-silver">
                    {row.roomNumber ? `Room ${row.roomNumber}` : '—'}
                    {row.bedCode ? ` · ${row.bedCode}` : ''}
                  </TD>
                  <TD className="tabular-nums text-apg-silver">{row.checkInDate}</TD>
                  <TD className="text-apg-silver">
                    Day {row.billingDay}
                    <span className="block text-[11px]">{row.billingCyclePolicyLabel}</span>
                  </TD>
                  <TD className="tabular-nums">{formatInr(row.monthlyRentPaise)}</TD>
                  <TD className="tabular-nums text-apg-silver">
                    {row.paidThroughDate ?? '—'}
                    {row.remainingPrepaidLabel ? (
                      <span className="block text-[11px] text-emerald-300/90">
                        {row.remainingPrepaidLabel}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="tabular-nums">{formatInr(row.outstandingRentPaise)}</TD>
                  <TD className="text-apg-silver">
                    {row.transitionAmountPaise != null
                      ? `${formatInr(row.transitionAmountPaise)}`
                      : '—'}
                    {row.transitionPeriodStart && row.transitionPeriodEnd ? (
                      <span className="block text-[11px]">
                        {row.transitionPeriodStart} → {row.transitionPeriodEnd}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <span className="text-xs font-medium text-white">
                      {statusLabel(row.migrationStatus)}
                    </span>
                    {row.blockedReason ? (
                      <span className="block text-[11px] text-rose-300">{row.blockedReason}</span>
                    ) : null}
                  </TD>
                  <TD>
                    {row.migrationStatus === 'eligible' && previewsByBookingId[row.bookingId] ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBookingId(
                            expandedBookingId === row.bookingId ? null : row.bookingId,
                          )
                        }
                        className="rounded-lg border border-[#FF5A1F]/40 px-2 py-1 text-xs font-semibold text-[#FF5A1F] hover:bg-[#FF5A1F]/10"
                      >
                        {expandedBookingId === row.bookingId ? 'Close' : 'Migrate to 1st'}
                      </button>
                    ) : (
                      <Link
                        href={row.residentHref}
                        className="text-xs font-semibold text-apg-silver hover:text-white"
                      >
                        View resident
                      </Link>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ))}

      {expandedPreview && expandedCandidate ? (
        <BillingCycleMigrationPanel
          bookingId={expandedCandidate.bookingId}
          customerId={expandedCandidate.customerId}
          preview={expandedPreview}
        />
      ) : null}
    </div>
  );
}
