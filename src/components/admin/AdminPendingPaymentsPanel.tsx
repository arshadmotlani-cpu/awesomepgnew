'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  approveElectricityProofAction,
  approveExtensionProofAction,
  approveQrPaymentAction,
  approveRentProofAction,
  rejectQrPaymentAction,
} from '@/app/(admin)/admin/payments/actions';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { PendingPaymentReviewItem } from '@/src/services/paymentProofQueue';
import { paiseToInr } from '@/src/lib/format';

const KIND_LABEL: Record<PendingPaymentReviewItem['kind'], string> = {
  qr: 'QR collection',
  rent: 'Rent invoice',
  electricity: 'Electricity',
  extension: 'Extension',
};

export function AdminPendingPaymentsPanel({
  items,
}: {
  items: PendingPaymentReviewItem[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApprove(item: PendingPaymentReviewItem) {
    setBusyKey(item.key);
    setError(null);
    try {
      let result: { ok: boolean; message?: string };
      switch (item.kind) {
        case 'qr':
          result = await approveQrPaymentAction(item.entityId, item.pgId);
          break;
        case 'rent':
          result = await approveRentProofAction(item.entityId, item.pgId);
          break;
        case 'electricity':
          result = await approveElectricityProofAction(item.entityId, item.pgId);
          break;
        case 'extension':
          result = await approveExtensionProofAction(item.entityId, item.pgId);
          break;
      }
      if (!result.ok) {
        setError(result.message ?? 'Approval failed.');
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusyKey(null);
    }
  }

  async function onRejectQr(item: PendingPaymentReviewItem) {
    if (item.kind !== 'qr') return;
    setBusyKey(item.key);
    setError(null);
    try {
      await rejectQrPaymentAction(item.entityId, item.pgId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setBusyKey(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No pending payment photos. When tenants pay and upload a screenshot, they appear here for
        your review.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {items.map((item) => (
        <article
          key={item.key}
          className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex-row lg:items-start"
        >
          <PaymentScreenshotPreview
            url={item.screenshotUrl}
            viewHref={adminPaymentProofViewUrl(item.kind, item.entityId)}
            alt={`${item.title} payment`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {KIND_LABEL[item.kind]}
              </span>
              <span className="text-xs text-zinc-500">{item.pgName}</span>
            </div>
            <h3 className="mt-1 font-semibold text-zinc-900">{item.title}</h3>
            <p className="text-sm text-zinc-600">{item.subtitle}</p>
            <p className="mt-1 text-lg font-semibold text-emerald-700">
              {paiseToInr(item.amountPaise)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyKey === item.key}
                onClick={() => void onApprove(item)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busyKey === item.key ? 'Working…' : 'Approve payment'}
              </button>
              {item.kind === 'qr' ? (
                <button
                  type="button"
                  disabled={busyKey === item.key}
                  onClick={() => void onRejectQr(item)}
                  className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Reject
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
