'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { RoomElectricityOperatorResidentRow } from '@/src/lib/billing/buildRoomElectricityOperatorView';

function paymentStatusTone(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30';
    case 'overdue':
      return 'bg-rose-500/15 text-rose-200 ring-rose-400/30';
    case 'partial':
      return 'bg-amber-500/15 text-amber-200 ring-amber-400/30';
    default:
      return 'bg-white/5 text-apg-silver ring-white/10';
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timelineDot(kind: string): string {
  switch (kind) {
    case 'bill_generated':
      return 'bg-[#FF5A1F]';
    case 'credit':
      return 'bg-sky-400';
    default:
      return 'bg-emerald-400';
  }
}

export function RoomElectricityResidentCard({ resident }: { resident: RoomElectricityOperatorResidentRow }) {
  const [showHistory, setShowHistory] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const breakdown = resident.lifetimeSummary.paymentBreakdown;

  return (
    <article className="rounded-2xl border border-white/[0.08] bg-[#1A1F27]/80 p-5 ring-1 ring-white/[0.04]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{resident.customerName}</h3>
          <p className="text-sm text-apg-silver">
            Bed {resident.bedCode ?? '—'}
            {resident.invoiceNumber ? ` · ${resident.invoiceNumber}` : ' · No invoice this month'}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${paymentStatusTone(resident.paymentStatus)}`}
        >
          {statusLabel(resident.paymentStatus)}
        </span>
      </header>

      <section className="mt-4 rounded-xl border border-white/[0.08] bg-[#12161C]/60 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
          Lifetime electricity summary
        </h4>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-apg-silver">Total billed</dt>
            <dd className="mt-0.5 text-sm font-medium text-white">
              {paiseToInr(resident.lifetimeSummary.totalBilledPaise)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Total paid</dt>
            <dd className="mt-0.5 text-sm font-medium text-emerald-300/90">
              {paiseToInr(resident.lifetimeSummary.totalPaidPaise)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Current outstanding</dt>
            <dd className="mt-0.5 text-sm font-semibold text-[#FF5A1F]">
              {resident.lifetimeSummary.currentOutstandingPaise > 0
                ? paiseToInr(resident.lifetimeSummary.currentOutstandingPaise)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Previous outstanding carried forward</dt>
            <dd className="mt-0.5 text-sm text-amber-200/90">
              {resident.lifetimeSummary.previousOutstandingCarriedForwardPaise > 0
                ? paiseToInr(resident.lifetimeSummary.previousOutstandingCarriedForwardPaise)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Last payment</dt>
            <dd className="mt-0.5 text-sm text-white">
              {resident.lifetimeSummary.lastPaymentDate
                ? formatDate(resident.lifetimeSummary.lastPaymentDate)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Last bill viewed</dt>
            <dd className="mt-0.5 text-sm text-white">
              {resident.lifetimeSummary.lastBillViewedDate
                ? formatDate(resident.lifetimeSummary.lastBillViewedDate)
                : 'Never'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Unpaid bills</dt>
            <dd className="mt-0.5 text-sm font-medium text-white">
              {resident.lifetimeSummary.unpaidBillsCount}
            </dd>
          </div>
        </dl>

        {breakdown.length > 0 ? (
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              How total paid breaks down
            </p>
            <ul className="mt-2 space-y-1.5">
              {breakdown.map((line) => (
                <li
                  key={line.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-apg-silver">{line.label}</span>
                  <span className="font-medium tabular-nums text-emerald-300/90">
                    {paiseToInr(line.amountPaise)}
                  </span>
                </li>
              ))}
              {breakdown.length > 1 ? (
                <li className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-1.5 text-sm font-medium">
                  <span className="text-white">Total paid</span>
                  <span className="tabular-nums text-emerald-300">
                    {paiseToInr(resident.lifetimeSummary.totalPaidPaise)}
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        ) : resident.lifetimeSummary.totalPaidPaise === 0 ? (
          <p className="mt-3 text-xs text-apg-silver">No payments recorded yet.</p>
        ) : null}
      </section>

      {resident.runningBalanceTimeline.length > 0 ? (
        <section className="mt-4 rounded-xl border border-white/[0.08] bg-[#12161C]/60 p-4">
          <button
            type="button"
            onClick={() => setShowTimeline((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
              Running balance timeline
            </h4>
            <span className="text-xs text-[#FF5A1F]">{showTimeline ? 'Hide' : 'Show'}</span>
          </button>

          {showTimeline ? (
            <ol className="mt-4 space-y-0">
              {resident.runningBalanceTimeline.map((event, index) => (
                <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < resident.runningBalanceTimeline.length - 1 ? (
                    <span
                      className="absolute left-[5px] top-3 h-full w-px bg-white/10"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${timelineDot(event.kind)}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm text-white">
                        {event.electricityBillId && event.kind === 'bill_generated' ? (
                          <Link
                            href={`/admin/electricity/bills/${event.electricityBillId}`}
                            className="text-[#FF5A1F] hover:underline"
                          >
                            {event.label}
                          </Link>
                        ) : event.electricityInvoiceId ? (
                          <Link
                            href={`/admin/electricity/invoices/${event.electricityInvoiceId}/as-resident`}
                            className="text-[#FF5A1F] hover:underline"
                          >
                            {event.label}
                          </Link>
                        ) : (
                          event.label
                        )}
                      </p>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          event.deltaPaise < 0 ? 'text-emerald-300/90' : 'text-white'
                        }`}
                      >
                        {event.deltaPaise < 0 ? '−' : '+'}
                        {paiseToInr(Math.abs(event.deltaPaise))}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-apg-silver">
                      {formatDate(event.date)}
                      {event.billingMonth ? ` · ${event.billingMonth.slice(0, 7)}` : ''}
                      {' · '}
                      Balance after:{' '}
                      <span className="font-medium text-white">
                        {paiseToInr(event.outstandingAfterPaise)}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Check-in</dt>
          <dd className="mt-0.5 text-sm text-white">{formatDate(resident.checkIn)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Check-out</dt>
          <dd className="mt-0.5 text-sm text-white">
            {resident.checkOut ? formatDate(resident.checkOut) : 'Still in room'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Days charged</dt>
          <dd className="mt-0.5 text-sm font-medium text-white">{resident.daysCharged}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Units allocated</dt>
          <dd className="mt-0.5 text-sm text-white">
            {resident.unitsAllocated != null ? resident.unitsAllocated.toFixed(2) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Electricity amount</dt>
          <dd className="mt-0.5 text-sm font-semibold text-white">
            {paiseToInr(resident.amountAllocatedPaise)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Previously collected</dt>
          <dd className="mt-0.5 text-sm text-emerald-300/90">
            {resident.previousCollectedPaise > 0
              ? paiseToInr(resident.previousCollectedPaise)
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Current bill</dt>
          <dd className="mt-0.5 text-sm text-white">{paiseToInr(resident.amountAllocatedPaise)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-apg-silver">Outstanding</dt>
          <dd className="mt-0.5 text-sm font-semibold text-[#FF5A1F]">
            {resident.currentOutstandingPaise > 0
              ? paiseToInr(resident.currentOutstandingPaise)
              : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        <span
          className={`rounded-full px-2.5 py-1 text-xs ring-1 ${
            resident.invoiceId
              ? 'bg-white/5 text-apg-silver ring-white/10'
              : 'bg-white/5 text-apg-silver/60 ring-white/5'
          }`}
        >
          Invoice {resident.invoiceId ? 'generated' : 'not generated'}
          {resident.invoiceCreatedAt
            ? ` · ${formatDate(resident.invoiceCreatedAt.slice(0, 10))}`
            : ''}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs ring-1 ${
            resident.firstViewedAt
              ? 'bg-sky-500/15 text-sky-200 ring-sky-400/30'
              : 'bg-white/5 text-apg-silver ring-white/10'
          }`}
        >
          {resident.firstViewedAt
            ? `Viewed ${formatDate(resident.firstViewedAt.slice(0, 10))}`
            : 'Not viewed yet'}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs ring-1 ${
            resident.isPaid
              ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30'
              : 'bg-amber-500/15 text-amber-200 ring-amber-400/30'
          }`}
        >
          {resident.isPaid
            ? `Paid${resident.paidAt ? ` · ${formatDate(resident.paidAt.slice(0, 10))}` : ''}`
            : 'Unpaid'}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {resident.invoiceId ? (
          <Link
            href={`/admin/electricity/invoices/${resident.invoiceId}/as-resident`}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            View as resident →
          </Link>
        ) : null}
        {resident.financialInvoiceId ? (
          <Link
            href={`/admin/invoices/${resident.financialInvoiceId}`}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Admin invoice →
          </Link>
        ) : null}
      </div>

      {resident.invoiceHistory.length > 0 || resident.paymentHistory.length > 0 ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-sm font-medium text-[#FF5A1F] hover:underline"
          >
            {showHistory ? 'Hide' : 'Show'} invoice & payment history (
            {resident.paymentHistory.length} payments · {resident.invoiceHistory.length} invoices)
          </button>

          {showHistory ? (
            <div className="mt-3 space-y-4">
              {resident.invoiceHistory.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    All electricity invoices
                  </p>
                  <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06]">
                    {resident.invoiceHistory.map((inv) => (
                      <li
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div>
                          <Link
                            href={`/admin/electricity/bills/${inv.electricityBillId}`}
                            className="font-medium text-[#FF5A1F] hover:underline"
                          >
                            {inv.billingMonth.slice(0, 7)} · {inv.invoiceNumber}
                          </Link>
                          <p className="text-xs text-apg-silver">
                            {statusLabel(inv.effectiveStatus)}
                            {inv.firstViewedAt
                              ? ` · viewed ${formatDate(inv.firstViewedAt.slice(0, 10))}`
                              : ' · not viewed'}
                            {' · '}
                            <Link
                              href={`/admin/electricity/invoices/${inv.id}/as-resident`}
                              className="text-apg-silver hover:text-white hover:underline"
                            >
                              Resident view
                            </Link>
                          </p>
                        </div>
                        <span className="font-medium tabular-nums text-white">
                          {paiseToInr(inv.paidPaise > 0 ? inv.paidPaise : inv.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {resident.paymentHistory.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Payment events
                  </p>
                  <ul className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.06]">
                    {resident.paymentHistory.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="text-white">{formatDate(p.date)}</p>
                          <p className="text-xs text-apg-silver">
                            {p.billingMonth.slice(0, 7)} · {p.paymentMode}
                            {p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}
                            {p.electricityInvoiceId ? (
                              <>
                                {' · '}
                                <Link
                                  href={`/admin/electricity/invoices/${p.electricityInvoiceId}/as-resident`}
                                  className="hover:text-white hover:underline"
                                >
                                  Invoice
                                </Link>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <span className="font-medium tabular-nums text-emerald-300/90">
                          {paiseToInr(p.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
