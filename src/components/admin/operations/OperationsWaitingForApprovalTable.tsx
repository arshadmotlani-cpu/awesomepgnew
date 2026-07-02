'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  approveDepositLinkProofAction,
  approveElectricityProofAction,
  approveExtensionProofAction,
  approveQrPaymentAction,
  approveRentProofAction,
  rejectDepositLinkProofAction,
  rejectElectricityProofAction,
  rejectExtensionProofAction,
  rejectQrPaymentAction,
  rejectRentProofAction,
} from '@/app/(admin)/admin/payments/actions';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { formatDateTime, paiseToInr } from '@/src/lib/format';
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
  const [rejectKey, setRejectKey] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const focusItem = useMemo(
    () => (focusKey ? items.find((i) => i.key === focusKey) : items[0]),
    [focusKey, items],
  );

  async function refreshAfterAction() {
    setRejectKey(null);
    setRejectReason('');
    router.refresh();
  }

  async function onApprove(item: PendingPaymentReviewItem) {
    setBusyKey(item.key);
    setError(null);
    try {
      let result: { ok: boolean; message?: string };
      switch (item.kind) {
        case 'qr':
          result = await approveQrPaymentAction(item.entityId, item.pgId, {}, item.key);
          break;
        case 'rent':
          result = await approveRentProofAction(item.entityId, item.pgId, item.key);
          break;
        case 'electricity':
          result = await approveElectricityProofAction(item.entityId, item.pgId, item.key);
          break;
        case 'extension':
          result = await approveExtensionProofAction(item.entityId, item.pgId, item.key);
          break;
        case 'deposit_link':
          result = await approveDepositLinkProofAction(item.entityId, item.pgId, item.key);
          break;
      }
      if (!result.ok) {
        setError(result.message ?? 'Approval failed.');
        return;
      }
      await refreshAfterAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusyKey(null);
    }
  }

  async function onReject(item: PendingPaymentReviewItem) {
    const needsReason = item.kind === 'rent' || item.kind === 'electricity';
    if (needsReason && !rejectReason.trim()) {
      setError('Add a rejection reason.');
      return;
    }
    setBusyKey(item.key);
    setError(null);
    try {
      let result: { ok: boolean; message?: string } = { ok: true };
      switch (item.kind) {
        case 'qr':
          result = await rejectQrPaymentAction(item.entityId, item.pgId, item.key);
          break;
        case 'rent':
          result = await rejectRentProofAction(
            item.entityId,
            item.pgId,
            rejectReason.trim(),
            item.key,
          );
          break;
        case 'electricity':
          result = await rejectElectricityProofAction(
            item.entityId,
            item.pgId,
            rejectReason.trim(),
            item.key,
          );
          break;
        case 'extension':
          result = await rejectExtensionProofAction(item.entityId, item.pgId, item.key);
          break;
        case 'deposit_link':
          result = await rejectDepositLinkProofAction(item.entityId, item.pgId, item.key);
          break;
      }
      if (!result.ok) {
        setError(result.message ?? 'Rejection failed.');
        return;
      }
      await refreshAfterAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setBusyKey(null);
    }
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
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {focusItem ? (
        <div className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 px-4 py-3 text-sm text-apg-silver">
          Reviewing <span className="font-medium text-white">{focusItem.residentName}</span> —{' '}
          {focusItem.paymentTypeLabel} · {paiseToInr(focusItem.amountPaise)}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-[#141820] text-[10px] uppercase tracking-wide text-apg-silver">
            <tr>
              <th className="px-4 py-3 font-medium">Resident</th>
              <th className="px-4 py-3 font-medium">Payment type</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Billing month</th>
              <th className="px-4 py-3 font-medium">Upload time</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-[#1A1F27]">
            {items.map((item) => {
              const busy = busyKey === item.key;
              const rejecting = rejectKey === item.key;
              return (
                <tr key={item.key} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-4 font-medium text-white">{item.residentName}</td>
                  <td className="px-4 py-4 text-apg-silver">{item.paymentTypeLabel}</td>
                  <td className="px-4 py-4 text-white">{paiseToInr(item.amountPaise)}</td>
                  <td className="px-4 py-4 text-apg-silver">
                    {formatBillingMonth(item.billingMonth)}
                  </td>
                  <td className="px-4 py-4 text-apg-silver">
                    {formatUploadTime(item.proofSubmittedAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={operationsFilterHref('waiting_for_approval', item.key)}
                          className="inline-flex min-h-[36px] items-center rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
                        >
                          Review
                        </Link>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRejectKey(item.key);
                            setRejectReason('');
                            setError(null);
                          }}
                          className="inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-apg-silver hover:text-white disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onApprove(item)}
                          className="inline-flex min-h-[36px] items-center rounded-lg border border-emerald-400/40 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          {busy ? '…' : 'Approve'}
                        </button>
                      </div>
                      {rejecting ? (
                        <div className="w-full max-w-xs space-y-2">
                          <input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Rejection reason"
                            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onReject(item)}
                            className="w-full rounded-lg bg-rose-600/80 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Confirm reject
                          </button>
                        </div>
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
