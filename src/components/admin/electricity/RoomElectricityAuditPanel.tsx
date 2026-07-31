'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { RoomElectricityAuditView } from '@/src/lib/billing/buildRoomElectricityAuditView';
import type { ElectricityResidentTimelineEvent } from '@/src/lib/billing/buildElectricityResidentTimeline';
import type { ElectricityPaymentHistoryRow } from '@/src/services/electricityPaymentHistory';

type Props = {
  audit: RoomElectricityAuditView;
  fullAudit?: RoomElectricityAuditView;
  paymentHistory?: ElectricityPaymentHistoryRow[];
};

function statusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'pending':
      return 'Pending';
    case 'cancelled':
      return 'Cancelled';
    case 'excluded_checkout_paid':
      return 'Excluded (checkout paid)';
    case 'settled_at_checkout':
      return 'Settled at checkout';
    case 'overdue':
      return 'Overdue';
    case 'partial':
      return 'Partial';
    default:
      return status.replace(/_/g, ' ');
  }
}

function collectionStatusLabel(
  status: RoomElectricityAuditView['roomSummary']['collectionStatus'],
): string {
  switch (status) {
    case 'fully_collected':
      return 'Fully collected';
    case 'partial':
      return 'Partially collected';
    default:
      return 'Nothing collected yet';
  }
}

function timelineIcon(kind: ElectricityResidentTimelineEvent['kind']): string {
  switch (kind) {
    case 'check_in':
      return '→';
    case 'bill_generated':
      return '⚡';
    case 'checkout_credit':
      return '✓';
    case 'partial_payment':
      return '₹';
    case 'remaining_due':
      return '!';
    case 'final_payment':
      return '✓';
    default:
      return '•';
  }
}

export function RoomElectricityAuditPanel({ audit, fullAudit, paymentHistory = [] }: Props) {
  const m = audit;
  const sumAudit = fullAudit ?? audit;
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [showPayments, setShowPayments] = useState(false);
  const s = m.roomSummary;

  const paymentsByBooking = paymentHistory.reduce<Map<string, ElectricityPaymentHistoryRow[]>>(
    (acc, row) => {
      const list = acc.get(row.bookingId) ?? [];
      list.push(row);
      acc.set(row.bookingId, list);
      return acc;
    },
    new Map(),
  );

  return (
    <section className="rounded-3xl bg-[#1A1F27]/80 ring-1 ring-white/[0.06] overflow-hidden">
      {/* Reconciliation banner */}
      {!m.isBalanced ? (
        <div className="border-b-4 border-rose-500 bg-rose-600 px-5 py-4 text-center">
          <p className="text-lg font-bold uppercase tracking-wide text-white">
            Reconciliation gap {paiseToInr(m.reconciliationGapPaise)}
          </p>
          <p className="mt-1 text-sm text-rose-100">
            Allocated + credits + remainder does not equal gross room bill — review ledger entries.
          </p>
        </div>
      ) : (
        <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-5 py-2 text-center text-sm text-emerald-200">
          Allocations balanced ✓
        </div>
      )}

      <div className="border-b border-white/[0.06] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-apg-silver">
          Room electricity audit
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          Room {s.roomNumber} · {s.pgName}
        </h2>
        <p className="mt-1 text-sm text-apg-silver">
          {formatDate(s.billingPeriodStart)} → {formatDate(s.billingPeriodEnd)}
        </p>
      </div>

      {/* Room Summary grid */}
      <div className="grid gap-px border-b border-white/[0.06] bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Meter',
            value: `${s.meterStartUnits} → ${s.meterEndUnits} (${s.unitsConsumed} units)`,
          },
          {
            label: 'Rate / gross',
            value: `${paiseToInr(s.ratePerUnitPaise)}/unit · ${paiseToInr(s.grossTotalPaise)}`,
          },
          {
            label: 'Residents',
            value: String(s.residentCount),
          },
          {
            label: 'Generated',
            value: s.generatedAt ? formatDate(s.generatedAt.slice(0, 10)) : '—',
          },
          {
            label: 'Splittable',
            value: paiseToInr(m.splittablePaise),
          },
          {
            label: 'Credits',
            value: paiseToInr(m.sumCreditsPaise),
          },
          {
            label: 'Collection',
            value: `${collectionStatusLabel(s.collectionStatus)} · ${s.collectionPercentage}%`,
          },
          {
            label: 'Collected / due',
            value: `${paiseToInr(s.collectedPaise)} / ${paiseToInr(s.outstandingPaise)}`,
          },
        ].map((item) => (
          <div key={item.label} className="bg-[#1A1F27]/80 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-apg-silver">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Resident Breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-apg-silver">
            <tr>
              <th className="px-4 py-3 font-medium w-8" />
              <th className="px-4 py-3 font-medium">Resident</th>
              <th className="px-4 py-3 font-medium">Bed</th>
              <th className="px-4 py-3 font-medium">Check-in</th>
              <th className="px-4 py-3 font-medium">Check-out</th>
              <th className="px-4 py-3 text-right font-medium">Days</th>
              <th className="px-4 py-3 text-right font-medium">Occ %</th>
              <th className="px-4 py-3 text-right font-medium">Units</th>
              <th className="px-4 py-3 text-right font-medium">Allocated</th>
              <th className="px-4 py-3 text-right font-medium">Prev out</th>
              <th className="px-4 py-3 text-right font-medium">Prev coll</th>
              <th className="px-4 py-3 text-right font-medium">Paid</th>
              <th className="px-4 py-3 text-right font-medium">Outstanding</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {m.residentRows.map((row) => {
              const expanded = expandedBookingId === row.bookingId;
              return (
                <Fragment key={row.bookingId}>
                  <tr
                    className="text-white/90 cursor-pointer hover:bg-white/[0.02]"
                    onClick={() =>
                      setExpandedBookingId(expanded ? null : row.bookingId)
                    }
                  >
                    <td className="px-4 py-3 text-apg-silver">{expanded ? '▼' : '▶'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{row.customerName}</p>
                      {row.invoiceNumber ? (
                        <p className="text-xs text-apg-silver">{row.invoiceNumber}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-apg-silver">{row.bedCode ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-apg-silver">
                      {formatDate(row.checkIn)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-apg-silver">
                      {row.checkOut ? formatDate(row.checkOut) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.daysCharged}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.occupancyPct}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.unitsAllocated != null ? row.unitsAllocated.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {paiseToInr(row.amountAllocatedPaise)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-300/90">
                      {row.previousOutstandingPaise > 0
                        ? paiseToInr(row.previousOutstandingPaise)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300/90">
                      {row.previousCollectedPaise > 0
                        ? paiseToInr(row.previousCollectedPaise)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.currentPaidPaise > 0 ? paiseToInr(row.currentPaidPaise) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[#FF5A1F]">
                      {row.currentOutstandingPaise > 0
                        ? paiseToInr(row.currentOutstandingPaise)
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs capitalize text-apg-silver">
                        {statusLabel(row.paymentStatus)}
                      </span>
                      {row.financialInvoiceId ? (
                        <Link
                          href={`/admin/invoices/${row.financialInvoiceId}`}
                          className="ml-2 text-xs text-[#FF5A1F] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Invoice →
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={14} className="px-6 py-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                          Timeline · {row.customerName}
                        </p>
                        <ol className="relative ml-3 border-l border-white/10 pl-6">
                          {row.timeline.map((ev, idx) => (
                            <li key={ev.id} className="mb-4 last:mb-0">
                              <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-[#1A1F27] text-[10px] ring-2 ring-white/10">
                                {timelineIcon(ev.kind)}
                              </span>
                              <p className="text-sm font-medium text-white">{ev.label}</p>
                              <p className="text-xs text-apg-silver">
                                {formatDate(ev.date)}
                                {ev.amountPaise != null && ev.amountPaise > 0
                                  ? ` · ${paiseToInr(ev.amountPaise)}`
                                  : ''}
                              </p>
                              {ev.financialInvoiceId ? (
                                <Link
                                  href={`/admin/invoices/${ev.financialInvoiceId}`}
                                  className="text-xs text-[#FF5A1F] hover:underline"
                                >
                                  View invoice →
                                </Link>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t border-white/[0.08] bg-white/[0.02] text-sm">
            <tr>
              <td colSpan={8} className="px-4 py-3 font-medium text-apg-silver">
                Sum check (full room)
              </td>
              <td className="px-4 py-3 text-right font-semibold text-white">
                {paiseToInr(sumAudit.sumAllocatedPaise)}
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right text-emerald-300/90">
                {paiseToInr(sumAudit.sumCreditsPaise)}
              </td>
              <td colSpan={2} className="px-4 py-3 text-right text-apg-silver">
                + remainder {paiseToInr(sumAudit.roundingRemainderPaise)} ={' '}
                <span className="font-semibold text-white">
                  {paiseToInr(
                    sumAudit.sumAllocatedPaise +
                      sumAudit.sumCreditsPaise +
                      sumAudit.roundingRemainderPaise,
                  )}
                </span>
                {' / '}
                {paiseToInr(sumAudit.grossTotalPaise)} gross
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment History */}
      {paymentHistory.length > 0 ? (
        <div className="border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setShowPayments((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-white hover:bg-white/[0.02]"
          >
            <span>Payment history ({paymentHistory.length} rows)</span>
            <span className="text-apg-silver">{showPayments ? '▼' : '▶'}</span>
          </button>
          {showPayments ? (
            <div className="border-t border-white/[0.06] px-5 pb-5">
              {[...paymentsByBooking.entries()].map(([bookingId, rows]) => {
                const name = rows[0]?.customerName ?? bookingId;
                return (
                  <div key={bookingId} className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      {name}
                    </p>
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-apg-silver">
                        <tr>
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Amount</th>
                          <th className="py-2 pr-3">Invoice</th>
                          <th className="py-2 pr-3">Mode</th>
                          <th className="py-2">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {rows.map((p) => (
                          <tr key={p.id}>
                            <td className="py-2 pr-3 tabular-nums text-apg-silver">
                              {formatDate(p.date)}
                            </td>
                            <td className="py-2 pr-3 font-medium text-white">
                              {paiseToInr(p.amountPaise)}
                            </td>
                            <td className="py-2 pr-3 text-apg-silver">
                              {p.invoiceNumber ?? '—'}
                            </td>
                            <td className="py-2 pr-3 text-apg-silver">{p.paymentMode}</td>
                            <td className="py-2 text-apg-silver">{p.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
