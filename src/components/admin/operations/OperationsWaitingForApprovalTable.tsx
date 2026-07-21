'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';
import { PaymentProofRejectionDialog } from '@/src/components/admin/operations/PaymentProofRejectionDialog';
import { useOperationsActionToast } from '@/src/components/admin/operations/OperationsActionToast';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { formatDateTime, paiseToInr } from '@/src/lib/format';
import { buildPaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';

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
  focusKey,
}: {
  items: PendingPaymentReviewItem[];
  focusKey?: string | null;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectDialogItem, setRejectDialogItem] = useState<PendingPaymentReviewItem | null>(null);
  const { showToast, toastNode } = useOperationsActionToast();

  const focusItem = useMemo(
    () => (focusKey ? items.find((i) => i.key === focusKey) : items[0]),
    [focusKey, items],
  );

  function refreshAfterAction(opts?: { rejected?: boolean }) {
    setRejectDialogItem(null);
    if (opts?.rejected) {
      showToast('Payment rejected successfully.');
    }
    startTransition(() => {
      router.replace(operationsFilterHref('waiting_for_approval'));
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-8 py-16 text-center">
        <p className="text-xl font-semibold text-emerald-100">Nothing waiting for approval</p>
        <p className="mt-2 text-sm text-emerald-200/80">Uploaded payment screenshots appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toastNode}
      {rejectDialogItem ? (
        <PaymentProofRejectionDialog
          item={rejectDialogItem}
          open
          onClose={() => setRejectDialogItem(null)}
          onRejected={() => void refreshAfterAction({ rejected: true })}
        />
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {focusItem ? (
        <div className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 px-4 py-3 text-sm text-apg-silver">
          Reviewing <span className="font-medium text-white">{focusItem.residentName}</span> —{' '}
          {focusItem.paymentTypeLabel} · Expected{' '}
          {paiseToInr(
            focusItem.invoiceAmountPaise != null
              ? focusItem.invoiceAmountPaise
              : focusItem.expectedTotalPaise,
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
            <tr>
              <th className="px-4 py-3 font-medium">Resident</th>
              <th className="px-4 py-3 font-medium">Payment type</th>
              <th className="px-4 py-3 font-medium">Expected</th>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Billing month</th>
              <th className="px-4 py-3 font-medium">Upload time</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-[#1A1F27]">
            {items.map((item) => {
              const busy = busyKey === item.key;
              const breakdown = buildPaymentReviewBreakdown(item);
              return (
                <tr key={item.key} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-4 font-medium text-white">{item.residentName}</td>
                  <td className="px-4 py-4 text-apg-silver">{item.paymentTypeLabel}</td>
                  <td className="px-4 py-4 text-white">
                    {paiseToInr(breakdown.totalExpectedPaise)}
                  </td>
                  <td className="px-4 py-4 text-emerald-300">
                    {paiseToInr(breakdown.receivedPaise)}
                  </td>
                  <td className="px-4 py-4 text-apg-silver">
                    {formatBillingMonth(item.billingMonth)}
                  </td>
                  <td className="px-4 py-4 text-apg-silver">
                    {formatUploadTime(item.proofSubmittedAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={operationsFilterHref('waiting_for_approval', item.key)}
                        className="inline-flex min-h-[36px] items-center rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
                      >
                        Review &amp; allocate
                      </Link>
                      {item.canReject ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRejectDialogItem(item);
                            setError(null);
                          }}
                          className="inline-flex min-h-[36px] items-center rounded-lg border border-rose-400/40 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
