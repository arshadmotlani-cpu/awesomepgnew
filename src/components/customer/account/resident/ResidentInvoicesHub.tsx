'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { paiseToInr, titleCase } from '@/src/lib/format';
import { InvoicePdfDownloadLink } from '@/src/components/billing/InvoicePdfDownloadLink';
import { invoicePdfDownloadHref } from '@/src/lib/billing/invoicePdfLinks';
import {
  ResidentElectricityHistory,
  type ResidentElectricityHistoryItem,
} from '@/src/components/customer/account/resident/ResidentElectricityHistory';
import { requestStatusTone, secondaryBtn } from '@/src/lib/design-system/tokens';
import type { PaidHistoryRow, LifetimeTotals } from '@/src/components/customer/account/resident/ResidentPaymentsV2Hub';

type Props = {
  paidBills: PaidHistoryRow[];
  cancelledBills?: PaidHistoryRow[];
  electricityHistory?: ResidentElectricityHistoryItem[];
  historyHref: string | null;
  lifetimeTotals: LifetimeTotals;
};

export function ResidentInvoicesHub({
  paidBills,
  cancelledBills = [],
  electricityHistory = [],
  historyHref,
  lifetimeTotals,
}: Props) {
  const [showCancelled, setShowCancelled] = useState(false);

  return (
    <div className="apg-resident-panel-content space-y-4 pb-2">
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
  );
}

export function invoiceStatusLabel(status: string): string {
  return titleCase(status.replace(/_/g, ' '));
}
