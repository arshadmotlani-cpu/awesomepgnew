'use client';

import Link from 'next/link';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { formatDateTime, paiseToInr } from '@/src/lib/format';
import { buildPaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { paymentReviewWorkspaceHref } from '@/src/lib/operations/paymentReviewLinks';

function formatBillingMonth(value: string | null | undefined): string {
  if (!value) return '—';
  return billingMonthLabel(value) || value.slice(0, 7);
}

function formatUploadTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDateTime(new Date(iso));
  } catch {
    return '—';
  }
}

export function OperationsWaitingForApprovalTable({
  items,
}: {
  items: PendingPaymentReviewItem[];
  focusKey?: string | null;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-8 py-16 text-center">
        <p className="text-xl font-semibold text-emerald-100">Nothing waiting for approval</p>
        <p className="mt-2 text-sm text-emerald-200/80">Uploaded payment screenshots appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
          <tr>
            <th className="px-4 py-3 font-medium">Resident</th>
            <th className="px-4 py-3 font-medium">Payment type</th>
            <th className="px-4 py-3 font-medium">Expected</th>
            <th className="px-4 py-3 font-medium">Proof amount</th>
            <th className="px-4 py-3 font-medium">Billing month</th>
            <th className="px-4 py-3 font-medium">Upload time</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 bg-[#1A1F27]">
          {items.map((item) => {
            const breakdown = buildPaymentReviewBreakdown(item);
            return (
              <tr key={item.key} className="transition hover:bg-white/[0.02]">
                <td className="px-4 py-4 font-medium text-white">{item.residentName}</td>
                <td className="px-4 py-4 text-apg-silver">{item.paymentTypeLabel}</td>
                <td className="px-4 py-4 text-white">
                  {paiseToInr(breakdown.totalExpectedPaise)}
                </td>
                <td className="px-4 py-4 text-emerald-300">
                  {paiseToInr(breakdown.proofAmountPaise)}
                </td>
                <td className="px-4 py-4 text-apg-silver">
                  {formatBillingMonth(item.billingMonth)}
                </td>
                <td className="px-4 py-4 text-apg-silver">
                  {formatUploadTime(item.proofSubmittedAt)}
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={paymentReviewWorkspaceHref(item.key)}
                    className="inline-flex min-h-[36px] items-center rounded-lg bg-apg-orange px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
                  >
                    Open review
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
