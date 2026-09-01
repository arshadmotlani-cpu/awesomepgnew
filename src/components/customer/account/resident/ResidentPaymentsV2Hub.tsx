'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { ResidentSubNav } from '@/src/components/customer/account/resident/ResidentSubpageLayout';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { residentPaymentsHref } from '@/src/lib/accountNavigation';
import type { ResidentPaymentsSub } from '@/src/lib/accountNavigation';
import { InvoicePdfDownloadLink } from '@/src/components/billing/InvoicePdfDownloadLink';
import { invoicePdfDownloadHref } from '@/src/lib/billing/invoicePdfLinks';
import {
  ResidentElectricityHistory,
  type ResidentElectricityHistoryItem,
} from '@/src/components/customer/account/resident/ResidentElectricityHistory';
import { requestStatusTone, primaryBtn, secondaryBtn } from '@/src/lib/design-system/tokens';
import { ResidentElectricityBillCalculationPanel } from '@/src/components/customer/account/resident/ResidentElectricityBillCalculationPanel';
import { ResidentElectricityPendingCard } from '@/src/components/customer/account/resident/ResidentElectricityPendingCard';
import { LateFeeCountdown } from '@/src/components/billing/LateFeeCountdown';
import { ElectricityDueCountdown } from '@/src/components/billing/ElectricityDueCountdown';
import type { ResidentElectricityBillingState } from '@/src/lib/residents/residentElectricityBillingState';
import { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';
export type PaidHistoryRow = {
  id: string;
  label: string;
  amountPaise: number;
  paidAt: string | null;
  status: string;
  invoiceNumber?: string;
  billingPeriodLabel?: string | null;
  billingPeriodLine?: string | null;
  transitionExplanation?: string | null;
  /** View invoice page (share / HTML document). */
  detailHref?: string | null;
  subtitle?: string | null;
  paymentModeLabel?: string | null;
};

import type { ResidentElectricityBillExplanation } from '@/src/lib/residents/residentElectricityBillExplanationTypes';

export type BillDueRow = PaymentDueRow & {
  why?: string;
  calc?: string;
  kind?: 'rent' | 'electricity' | 'deposit' | 'penalty' | 'other';
  electricityExplanation?: ResidentElectricityBillExplanation | null;
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
  cancelledBills?: PaidHistoryRow[];
  pendingRentNotice?: string | null;
  electricityBillingPending?: ResidentElectricityBillingState | null;
  electricityHistory?: ResidentElectricityHistoryItem[];
  historyHref: string | null;
  lifetimeTotals: LifetimeTotals;
};

function BillCard({ row }: { row: BillDueRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasElectricityExplanation = row.kind === 'electricity' && row.electricityExplanation;

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4 max-md:p-3">
      <div className="flex flex-col gap-3 max-md:gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{row.label}</p>
          {row.billingPeriodLabel ? (
            <p className="mt-1.5 text-sm font-medium text-white/90">{row.billingPeriodLabel}</p>
          ) : null}
          {row.billingPeriodLine ? (
            <p className="mt-1 text-xs text-apg-silver">{row.billingPeriodLine}</p>
          ) : null}
          {row.transitionExplanation ? (
            <p className="mt-1 text-xs text-apg-silver">{row.transitionExplanation}</p>
          ) : row.why ? (
            <p className="mt-1 text-xs text-apg-silver">{row.why}</p>
          ) : null}
          {row.dueDate ? (
            <p className="mt-1 text-xs text-apg-silver">Due {formatDate(row.dueDate)}</p>
          ) : null}
          {row.kind === 'rent' && row.rentIssueDate ? (
            <div className="mt-1">
              <LateFeeCountdown issueDate={row.rentIssueDate} className="text-xs text-apg-silver" />
            </div>
          ) : null}
          {row.kind === 'electricity' && row.electricityDueDate ? (
            <div className="mt-1">
              <ElectricityDueCountdown dueDate={row.electricityDueDate} className="text-xs text-apg-silver" />
            </div>
          ) : null}
          {row.kind === 'rent' && (row.lateFeePaise ?? 0) > 0 ? (
            <p className="mt-0.5 text-xs text-amber-200">
              Includes late fee {paiseToInr(row.lateFeePaise!)}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-row items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
          <span className="text-base font-bold tabular-nums text-white">
            {paiseToInr(row.amountPaise)}
          </span>
          <StatusChip status={row.status} toneMap={requestStatusTone} />
        </div>
      </div>
      {hasElectricityExplanation ? (
        <div className="mt-3">
          <ResidentElectricityBillCalculationPanel
            explanation={row.electricityExplanation!}
            theme="dark"
          />
        </div>
      ) : row.calc ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium text-apg-cyan hover:text-apg-orange"
          >
            {expanded ? 'Hide calculation' : 'How calculated'}
          </button>
          {expanded ? (
            <p className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs whitespace-pre-wrap text-apg-silver">
              {row.calc}
            </p>
          ) : null}
        </>
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
  cancelledBills = [],
  pendingRentNotice = null,
  electricityBillingPending = null,
  electricityHistory = [],
  historyHref,
  lifetimeTotals,
}: Props) {
  const [showCancelled, setShowCancelled] = useState(false);
  const subNav = [
    { id: 'due', label: 'Bills Due', href: residentPaymentsHref('due') },
    { id: 'invoices', label: 'Invoices', href: residentPaymentsHref('invoices') },
  ];

  const payableDue = dueRows.filter((r) => r.href);
  const totalDuePaise = computeResidentTotalDuePaise(dueRows);
  const showElectricityPending = electricityBillingPending?.showPendingCard === true;
  const hideZeroDueHeader = showElectricityPending && totalDuePaise === 0;

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
                {hideZeroDueHeader ? (
                  <p className="mt-1 text-lg font-semibold text-apg-silver">
                    No payment due right now
                  </p>
                ) : (
                  <p className="mt-1 text-3xl font-bold tabular-nums text-apg-orange">
                    {paiseToInr(totalDuePaise)}
                  </p>
                )}
                {payableDue.length > 1 ? (
                  <p className="mt-2 text-xs text-apg-silver">
                    Pay each bill separately using the buttons below.
                  </p>
                ) : null}
              </div>
            </div>
          </ApgCard>

          {showElectricityPending && electricityBillingPending ? (
            <ResidentElectricityPendingCard state={electricityBillingPending} />
          ) : null}

          {pendingApprovalRows.length > 0 ? (
            <p className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              Payment submitted — we are reviewing your screenshot.
            </p>
          ) : null}

          {pendingRentNotice ? (
            <ApgCard tier="resident">
              <p className="text-sm text-apg-silver">{pendingRentNotice}</p>
            </ApgCard>
          ) : null}

          {payableDue.length === 0 &&
          pendingApprovalRows.length === 0 &&
          rejectedBillRows.length === 0 &&
          !showElectricityPending ? (
            <ApgCard tier="resident">
              <p className="text-sm text-apg-silver">No bills waiting for payment right now.</p>
            </ApgCard>
          ) : payableDue.length > 0 ? (
            <ul className="space-y-3">
              {payableDue.map((row) => (
                <BillCard key={row.key} row={row} />
              ))}
            </ul>
          ) : null}

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
                  <li key={row.key} className="flex justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="text-apg-silver">{row.label}</span>
                      {row.billingPeriodLabel ? (
                        <p className="mt-0.5 text-xs text-apg-silver/80">{row.billingPeriodLabel}</p>
                      ) : null}
                    </div>
                    <span className="font-semibold text-white shrink-0">{paiseToInr(row.amountPaise)}</span>
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

          {electricityHistory.length > 0 ? (
            <ApgCard tier="resident">
              <ResidentElectricityHistory items={electricityHistory} theme="dark" />
            </ApgCard>
          ) : null}

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
                      {row.billingPeriodLabel ? (
                        <p className="mt-0.5 text-xs text-apg-silver">{row.billingPeriodLabel}</p>
                      ) : null}
                      {row.paymentModeLabel ? (
                        <p className="text-xs text-apg-silver">Paid via {row.paymentModeLabel}</p>
                      ) : row.subtitle ? (
                        <p className="text-xs text-apg-silver">{row.subtitle}</p>
                      ) : null}
                      {row.paidAt ? (
                        <p className="text-xs text-apg-silver">Issued {row.paidAt}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-white">
                        {paiseToInr(row.amountPaise)}
                      </span>
                      {row.detailHref ? (
                        <Link
                          href={row.detailHref}
                          className="rounded-lg border border-white/15 px-2 py-1 text-[11px] font-medium text-apg-silver hover:text-white"
                        >
                          View invoice
                        </Link>
                      ) : null}
                      {row.invoiceNumber ? (
                        <InvoicePdfDownloadLink
                          href={invoicePdfDownloadHref(row.invoiceNumber)}
                          label="Download PDF"
                          className="rounded-lg border border-white/15 px-2 py-1 text-[11px] font-medium text-apg-silver hover:text-white"
                        />
                      ) : null}
                      <StatusChip
                        status={row.status === 'partial' ? 'Partially paid' : row.status}
                        toneMap={requestStatusTone}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </ApgCard>
          )}

          {cancelledBills.length > 0 ? (
            <ApgCard tier="resident">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-apg-silver">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="rounded border-white/20"
                />
                Show cancelled invoices
              </label>
              {showCancelled ? (
                <ul className="mt-3 divide-y divide-white/10">
                  {cancelledBills.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">{row.label}</p>
                        <p className="text-xs text-apg-silver">Cancelled</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-apg-silver">
                        {paiseToInr(row.amountPaise)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </ApgCard>
          ) : null}

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
