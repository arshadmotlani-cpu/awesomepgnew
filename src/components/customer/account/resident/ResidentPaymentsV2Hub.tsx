'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { ResidentSubNav } from '@/src/components/customer/account/resident/ResidentSubpageLayout';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { residentPaymentsHref } from '@/src/lib/accountNavigation';
import type { ResidentPaymentsSub } from '@/src/lib/accountNavigation';
import { requestStatusTone, primaryBtn, secondaryBtn } from '@/src/lib/design-system/tokens';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
export type PaidHistoryRow = {
  id: string;
  label: string;
  amountPaise: number;
  paidAt: string | null;
  status: string;
  invoiceNumber?: string;
};

export type BillDueRow = PaymentDueRow & {
  why?: string;
  calc?: string;
  kind?: 'rent' | 'electricity' | 'deposit' | 'penalty' | 'other';
};

export type LifetimeTotals = {
  rentPaidPaise: number;
  depositPaidPaise: number;
  electricityPaidPaise: number;
  otherPaidPaise: number;
};

type Props = {
  sub: ResidentPaymentsSub;
  dueRows: BillDueRow[];
  pendingApprovalRows: PaymentDueRow[];
  rejectedBillRows?: PaymentDueRow[];
  paidBills: PaidHistoryRow[];
  historyHref: string | null;
  lifetimeTotals: LifetimeTotals;
};

function BillCard({ row }: { row: BillDueRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{row.label}</p>
          {row.why ? <p className="mt-1 text-xs text-apg-silver">{row.why}</p> : null}
          {row.dueDate ? (
            <p className="mt-1 text-xs text-apg-silver">Due {formatDate(row.dueDate)}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-base font-bold tabular-nums text-white">
            {paiseToInr(row.amountPaise)}
          </span>
          <StatusChip status={row.status} toneMap={requestStatusTone} />
        </div>
      </div>
      {row.calc ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-apg-cyan hover:text-apg-orange"
        >
          {expanded ? 'Hide calculation' : 'How calculated'}
        </button>
      ) : null}
      {expanded && row.calc ? (
        <p className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs whitespace-pre-wrap text-apg-silver">
          {row.calc}
        </p>
      ) : null}
      {row.href ? (
        <Link
          href={row.href}
          className={`${primaryBtn} mt-3 w-full`}
        >
          {row.status === 'Rejected' ? 'Upload new screenshot' : `Pay ${paiseToInr(row.amountPaise)}`}
        </Link>
      ) : null}
      {row.rejectionReason ? (
        <p className="mt-2 text-xs text-rose-200">
          <span className="font-medium">Reason:</span> {row.rejectionReason}
        </p>
      ) : null}
      {row.rejectionMessage ? (
        <p className="mt-1 text-xs text-apg-silver line-clamp-3">{row.rejectionMessage}</p>
      ) : null}
    </li>
  );
}

export function ResidentPaymentsV2Hub({
  sub,
  dueRows,
  pendingApprovalRows,
  rejectedBillRows = [],
  paidBills,
  historyHref,
  lifetimeTotals,
}: Props) {
  const subNav = [
    { id: 'due', label: 'Bills Due', href: residentPaymentsHref('due') },
    { id: 'invoices', label: 'Invoices', href: residentPaymentsHref('invoices') },
  ];

  const payableDue = dueRows.filter((r) => r.href);
  const totalDuePaise = payableDue.reduce((s, r) => s + r.amountPaise, 0);

  return (
    <div className="apg-resident-panel-content">
      <ResidentSubNav items={subNav} activeId={sub} />

      {sub === 'due' ? (
        <div className="space-y-4 pb-2">
          <ApgCard tier="resident">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-apg-silver">
                  Total due
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-apg-orange">
                  {paiseToInr(totalDuePaise)}
                </p>
                {payableDue.length > 1 ? (
                  <p className="mt-2 text-xs text-apg-silver">
                    Pay each bill separately using the buttons below.
                  </p>
                ) : null}
              </div>
            </div>
          </ApgCard>

          {pendingApprovalRows.length > 0 ? (
            <p className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              Payment submitted — we are reviewing your screenshot.
            </p>
          ) : null}

          {payableDue.length === 0 &&
          pendingApprovalRows.length === 0 &&
          rejectedBillRows.length === 0 ? (
            <ApgCard tier="resident">
              <p className="text-sm text-apg-silver">No bills waiting for payment right now.</p>
            </ApgCard>
          ) : (
            <ul className="space-y-3">
              {payableDue.map((row) => (
                <BillCard key={row.key} row={row} />
              ))}
            </ul>
          )}

          {rejectedBillRows.length > 0 ? (
            <ApgCard tier="resident">
              <h2 className="text-sm font-semibold text-rose-200">Rejected — action required</h2>
              <ul className="mt-3 space-y-3">
                {rejectedBillRows.map((row) => (
                  <BillCard key={row.key} row={row} />
                ))}
              </ul>
            </ApgCard>
          ) : null}

          {pendingApprovalRows.length > 0 ? (
            <ApgCard tier="resident">
              <h2 className="text-sm font-semibold text-white">Pending approval</h2>
              <ul className="mt-3 space-y-2">
                {pendingApprovalRows.map((row) => (
                  <li key={row.key} className="flex justify-between text-sm">
                    <span className="text-apg-silver">{row.label}</span>
                    <span className="font-semibold text-white">{paiseToInr(row.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            </ApgCard>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <ApgCard tier="resident">
            <h2 className="text-sm font-semibold text-white">Lifetime totals</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-[10px] uppercase text-apg-silver">Rent paid</dt>
                <dd className="text-sm font-bold tabular-nums text-white">
                  {paiseToInr(lifetimeTotals.rentPaidPaise)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-apg-silver">Deposit paid</dt>
                <dd className="text-sm font-bold tabular-nums text-white">
                  {paiseToInr(lifetimeTotals.depositPaidPaise)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-apg-silver">Electricity paid</dt>
                <dd className="text-sm font-bold tabular-nums text-white">
                  {paiseToInr(lifetimeTotals.electricityPaidPaise)}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-apg-silver">Other charges</dt>
                <dd className="text-sm font-bold tabular-nums text-white">
                  {paiseToInr(lifetimeTotals.otherPaidPaise)}
                </dd>
              </div>
            </dl>
          </ApgCard>

          {paidBills.length === 0 ? (
            <ApgCard tier="resident">
              <p className="text-sm text-apg-silver">No paid invoices yet.</p>
            </ApgCard>
          ) : (
            <ApgCard tier="resident">
              <h2 className="text-sm font-semibold text-white">Paid invoices</h2>
              <ul className="mt-3 divide-y divide-white/10">
                {paidBills.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{row.label}</p>
                      {row.paidAt ? (
                        <p className="text-xs text-apg-silver">Paid {row.paidAt}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-white">
                        {paiseToInr(row.amountPaise)}
                      </span>
                      <StatusChip status={row.status} toneMap={requestStatusTone} />
                    </div>
                  </li>
                ))}
              </ul>
            </ApgCard>
          )}

          {historyHref ? (
            <Link href={historyHref} className={`${secondaryBtn} w-full`}>
              Full payment history →
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function invoiceStatusLabel(status: string): string {
  return titleCase(status.replace(/_/g, ' '));
}
