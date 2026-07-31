'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { BillingOperationsRowActions } from '@/src/components/admin/billing/BillingOperationsRowActions';
import {
  applyBillingOperationsFilters,
  groupUpcomingByBucket,
  type BillingOperationsFilters,
  type BillingOperationsSnapshot,
  type BillingOpsStatusFilter,
  type OverdueBucket,
  type UpcomingGenerationHighlight,
} from '@/src/lib/admin/billingOperationsPresentation';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';

const STATUS_FILTERS: Array<{ id: BillingOpsStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'generated', label: 'Generated' },
  { id: 'pending', label: 'Pending' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
];

const OVERDUE_BUCKETS: OverdueBucket[] = ['1-3', '4-7', '8-15', '15+'];

const OVERDUE_BADGE: Record<OverdueBucket, string> = {
  '1-3': 'bg-amber-500/20 text-amber-100 ring-amber-400/40',
  '4-7': 'bg-orange-500/20 text-orange-100 ring-orange-400/40',
  '8-15': 'bg-rose-500/20 text-rose-100 ring-rose-400/40',
  '15+': 'bg-rose-600/30 text-rose-50 ring-rose-500/50',
};

function highlightRowClass(highlight: UpcomingGenerationHighlight): string {
  if (highlight === 'red') return 'bg-rose-500/10';
  if (highlight === 'orange') return 'bg-orange-500/10';
  if (highlight === 'yellow') return 'bg-amber-500/10';
  return '';
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'warn' | 'success';
}) {
  const valueClass =
    tone === 'warn' ? 'text-rose-300' : tone === 'success' ? 'text-emerald-300' : 'text-white';
  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-apg-silver">{sub}</p> : null}
    </div>
  );
}

export function BillingOperationsDashboard({
  snapshot,
  canMarkCash,
  adminName,
}: {
  snapshot: BillingOperationsSnapshot;
  canMarkCash: boolean;
  adminName: string;
}) {
  const [filters, setFilters] = useState<BillingOperationsFilters>({ status: 'all' });

  const data = useMemo(
    () => applyBillingOperationsFilters(snapshot, filters),
    [snapshot, filters],
  );

  const upcomingGroups = useMemo(
    () => groupUpcomingByBucket(data.upcomingGeneration),
    [data.upcomingGeneration],
  );

  const showUpcoming = filters.status === 'all' || filters.status === 'upcoming';
  const showGenerated = filters.status === 'all' || filters.status === 'generated';
  const showPending = filters.status === 'all' || filters.status === 'pending';
  const showPaid = filters.status === 'all' || filters.status === 'paid';
  const showOverdue = filters.status === 'all' || filters.status === 'overdue';

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block text-xs text-apg-silver">
            PG
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              value={filters.pgId ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, pgId: e.target.value || undefined }))}
            >
              <option value="">All PGs</option>
              {snapshot.pgs.map((pg) => (
                <option key={pg.id} value={pg.id}>
                  {pg.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-apg-silver">
            Room
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              placeholder="Room number"
              value={filters.roomQuery ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, roomQuery: e.target.value || undefined }))}
            />
          </label>
          <label className="block text-xs text-apg-silver">
            Resident
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#12161C] px-3 py-2 text-sm text-white"
              placeholder="Name or mobile"
              value={filters.residentQuery ?? ''}
              onChange={(e) =>
                setFilters((f) => ({ ...f, residentQuery: e.target.value || undefined }))
              }
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, status: option.id }))}
              className={
                'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
                ((filters.status ?? 'all') === option.id
                  ? 'bg-[#FF5A1F] text-white'
                  : 'border border-white/10 text-apg-silver hover:text-white')
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white">Daily billing summary</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Bills generating today" value={String(data.kpis.billsGeneratingToday)} />
          <KpiCard label="Bills generating this week" value={String(data.kpis.billsGeneratingThisWeek)} />
          <KpiCard
            label="Pending collections"
            value={paiseToInr(data.kpis.pendingCollectionsPaise)}
            sub={`${data.kpis.pendingCollectionsCount} invoices`}
            tone={data.kpis.pendingCollectionsCount > 0 ? 'warn' : 'default'}
          />
          <KpiCard
            label="Overdue collections"
            value={paiseToInr(data.kpis.overdueCollectionsPaise)}
            sub={`${data.kpis.overdueCollectionsCount} invoices`}
            tone={data.kpis.overdueCollectionsCount > 0 ? 'warn' : 'default'}
          />
          <KpiCard
            label="Collected today"
            value={paiseToInr(data.kpis.collectedTodayPaise)}
            sub={`${data.kpis.collectedTodayCount} payments`}
            tone="success"
          />
          <KpiCard
            label="Collected this month"
            value={paiseToInr(data.kpis.collectedThisMonthPaise)}
            sub={`${data.kpis.collectedThisMonthCount} payments`}
            tone="success"
          />
        </dl>
      </section>

      {showUpcoming ? (
        <section>
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-white">Upcoming bill generation</h2>
            <p className="mt-1 text-xs text-apg-silver">
              Scheduled rent bills by generation date — today, next 3 days, and next 7 days.
            </p>
          </header>
          {data.upcomingGeneration.length === 0 ? (
            <p className="rounded-xl border border-white/10 px-4 py-6 text-sm text-apg-silver">
              No upcoming bill generation in the selected window.
            </p>
          ) : (
            <div className="space-y-6">
              {[
                { key: 'today', label: 'Today', rows: upcomingGroups.today },
                { key: 'next3', label: 'Next 3 days', rows: upcomingGroups.next3 },
                { key: 'next7', label: 'Next 7 days', rows: upcomingGroups.next7 },
              ].map(({ key, label, rows }) =>
                rows.length === 0 ? null : (
                  <div key={key}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      {label} ({rows.length})
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Resident</TH>
                            <TH>PG · room · bed</TH>
                            <TH>Billing cycle</TH>
                            <TH>Generation date</TH>
                            <TH className="text-right">Expected rent</TH>
                            <TH className="text-right">Deposit held</TH>
                            <TH className="text-right">Outstanding</TH>
                            <TH>Booking</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {rows.map((row) => (
                            <TR key={`${row.bookingId}-${row.issueDate}`} className={highlightRowClass(row.highlight)}>
                              <TD>
                                <Link
                                  href={`/admin/residents/${row.customerId}`}
                                  className="font-medium text-white hover:text-[#FF5A1F]"
                                >
                                  {row.customerName}
                                </Link>
                                <p className="font-mono text-[11px] text-apg-silver">{row.customerPhone}</p>
                              </TD>
                              <TD className="text-xs text-apg-silver">
                                {row.pgName} · R{row.roomNumber} · {row.bedCode}
                              </TD>
                              <TD className="text-xs">{row.billingCycleLabel}</TD>
                              <TD className="text-xs">{formatDate(row.issueDate)}</TD>
                              <TD className="text-right tabular-nums">{paiseToInr(row.expectedRentPaise)}</TD>
                              <TD className="text-right tabular-nums">{paiseToInr(row.depositHeldPaise)}</TD>
                              <TD className="text-right tabular-nums">{paiseToInr(row.currentOutstandingPaise)}</TD>
                              <TD>
                                <Badge tone={toneForStatus(row.bookingStatus)}>
                                  {titleCase(row.bookingStatus.replace(/_/g, ' '))}
                                </Badge>
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      ) : null}

      {showGenerated ? (
        <section>
          <header className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Bills generated today</h2>
              <p className="mt-1 text-xs text-apg-silver">Auto-generated rent invoices for {formatDate(data.todayIso)}.</p>
            </div>
            <Link href="/admin/billing?tab=generated" className="text-xs font-medium text-[#FF5A1F] hover:underline">
              Full run details →
            </Link>
          </header>
          {data.generatedToday.length === 0 ? (
            <p className="rounded-xl border border-white/10 px-4 py-6 text-sm text-apg-silver">
              No bills generated today yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Resident</TH>
                    <TH>Room</TH>
                    <TH>Invoice</TH>
                    <TH className="text-right">Rent</TH>
                    <TH className="text-right">Electricity</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.generatedToday.map((row) => (
                    <TR key={row.invoiceId}>
                      <TD>
                        <Link
                          href={`/admin/residents/${row.customerId}`}
                          className="font-medium text-white hover:text-[#FF5A1F]"
                        >
                          {row.customerName}
                        </Link>
                      </TD>
                      <TD className="text-xs">R{row.roomNumber}</TD>
                      <TD className="font-mono text-[11px]">
                        {row.financialInvoiceId ? (
                          <Link href={`/admin/invoices/${row.financialInvoiceId}`} className="hover:text-[#FF5A1F]">
                            {row.invoiceNumber}
                          </Link>
                        ) : (
                          row.invoiceNumber
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">{paiseToInr(row.rentPaise)}</TD>
                      <TD className="text-right tabular-nums">
                        {row.electricityPaise != null ? paiseToInr(row.electricityPaise) : '—'}
                      </TD>
                      <TD className="text-right tabular-nums font-semibold">{paiseToInr(row.totalPaise)}</TD>
                      <TD>
                        <Badge tone={toneForStatus(row.paymentStatus)}>
                          {titleCase(row.paymentStatus.replace(/_/g, ' '))}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {showPending ? (
        <section>
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-white">Pending payments</h2>
            <p className="mt-1 text-xs text-apg-silver">
              Unpaid rent invoices — reminder history and quick collection actions.
            </p>
          </header>
          {data.pendingPayments.length === 0 ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-100">
              No pending rent collections.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Resident</TH>
                    <TH>Room</TH>
                    <TH>Invoice</TH>
                    <TH>Generated</TH>
                    <TH>Due</TH>
                    <TH>Days out</TH>
                    <TH className="text-right">Amount due</TH>
                    <TH>Last reminder</TH>
                    <TH>Reminders</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.pendingPayments.map((row) => (
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
                      <TD className="text-xs">
                        R{row.roomNumber}
                        {row.bedCode ? ` · ${row.bedCode}` : ''}
                      </TD>
                      <TD className="font-mono text-[11px]">{row.invoiceNumber}</TD>
                      <TD className="text-xs">{formatDate(row.generatedDate)}</TD>
                      <TD className="text-xs">{formatDate(row.dueDate)}</TD>
                      <TD className="text-xs tabular-nums">{row.daysOutstanding > 0 ? row.daysOutstanding : '—'}</TD>
                      <TD className="text-right tabular-nums font-semibold">{paiseToInr(row.amountDuePaise)}</TD>
                      <TD className="text-xs whitespace-nowrap">
                        {row.lastReminderSentAt ? formatDateTime(row.lastReminderSentAt) : '—'}
                      </TD>
                      <TD className="text-xs tabular-nums">{row.reminderCount}</TD>
                      <TD>
                        <Badge tone={toneForStatus(row.paymentStatus)}>
                          {titleCase(row.paymentStatus.replace(/_/g, ' '))}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <BillingOperationsRowActions
                          customerId={row.customerId}
                          customerName={row.customerFullName}
                          phone={row.customerPhone}
                          pgId={row.pgId}
                          pgName={row.pgName}
                          roomNumber={row.roomNumber}
                          amountPaise={row.amountDuePaise}
                          dueDate={row.dueDate}
                          bookingId={row.bookingId}
                          financialInvoiceId={row.financialInvoiceId}
                          canMarkCash={canMarkCash}
                          adminName={adminName}
                          invoiceNumber={row.invoiceNumber}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {showPaid ? (
        <section>
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-white">Recently paid</h2>
            <p className="mt-1 text-xs text-apg-silver">Latest approved rent and electricity payments.</p>
          </header>
          {data.recentlyPaid.length === 0 ? (
            <p className="rounded-xl border border-white/10 px-4 py-6 text-sm text-apg-silver">
              No recent payments recorded.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Resident</TH>
                    <TH>Room</TH>
                    <TH>Invoice</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Mode</TH>
                    <TH>Paid on</TH>
                    <TH>Approved by</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.recentlyPaid.slice(0, 25).map((row) => (
                    <TR key={row.id}>
                      <TD>
                        {row.customerId ? (
                          <Link
                            href={`/admin/residents/${row.customerId}`}
                            className="font-medium text-white hover:text-[#FF5A1F]"
                          >
                            {row.customerFullName}
                          </Link>
                        ) : (
                          row.customerFullName
                        )}
                      </TD>
                      <TD className="text-xs">
                        R{row.roomNumber}
                        {row.bedCode ? ` · ${row.bedCode}` : ''}
                      </TD>
                      <TD className="font-mono text-[11px]">{row.invoiceNumber}</TD>
                      <TD className="text-right tabular-nums">{paiseToInr(row.amountPaise)}</TD>
                      <TD className="text-xs">{row.paymentMode ?? '—'}</TD>
                      <TD className="text-xs whitespace-nowrap">
                        {row.paidAt ? formatDateTime(row.paidAt) : '—'}
                      </TD>
                      <TD className="text-xs">{row.collectedBy ?? '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      ) : null}

      {showOverdue ? (
        <section>
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-white">Overdue</h2>
            <p className="mt-1 text-xs text-apg-silver">Unpaid invoices grouped by days overdue.</p>
          </header>
          {OVERDUE_BUCKETS.every((b) => data.overdueByBucket[b].length === 0) ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-100">
              No overdue rent invoices.
            </p>
          ) : (
            <div className="space-y-6">
              {OVERDUE_BUCKETS.map((bucket) => {
                const rows = data.overdueByBucket[bucket];
                if (rows.length === 0) return null;
                return (
                  <div key={bucket}>
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 ring-1 ${OVERDUE_BADGE[bucket]}`}>
                        {bucket} days
                      </span>
                      <span>({rows.length})</span>
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      <Table>
                        <THead>
                          <TR>
                            <TH>Resident</TH>
                            <TH>Room</TH>
                            <TH>Invoice</TH>
                            <TH>Due</TH>
                            <TH>Days overdue</TH>
                            <TH className="text-right">Amount</TH>
                            <TH>Reminders</TH>
                            <TH className="text-right">Actions</TH>
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
                              </TD>
                              <TD className="text-xs">R{row.roomNumber}</TD>
                              <TD className="font-mono text-[11px]">{row.invoiceNumber}</TD>
                              <TD className="text-xs">{formatDate(row.dueDate)}</TD>
                              <TD className="text-xs font-semibold text-rose-300">{row.daysOutstanding}</TD>
                              <TD className="text-right tabular-nums">{paiseToInr(row.amountDuePaise)}</TD>
                              <TD className="text-xs tabular-nums">{row.reminderCount}</TD>
                              <TD className="text-right">
                                <BillingOperationsRowActions
                                  customerId={row.customerId}
                                  customerName={row.customerFullName}
                                  phone={row.customerPhone}
                                  pgId={row.pgId}
                                  pgName={row.pgName}
                                  roomNumber={row.roomNumber}
                                  amountPaise={row.amountDuePaise}
                                  dueDate={row.dueDate}
                                  bookingId={row.bookingId}
                                  financialInvoiceId={row.financialInvoiceId}
                                  canMarkCash={canMarkCash}
                                  adminName={adminName}
                                  invoiceNumber={row.invoiceNumber}
                                />
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
