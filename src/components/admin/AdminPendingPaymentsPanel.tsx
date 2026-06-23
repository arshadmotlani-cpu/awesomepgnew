'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  approveElectricityProofAction,
  approveDepositLinkProofAction,
  approveExtensionProofAction,
  approvePartialQrPaymentAction,
  approveQrPaymentAction,
  approveRentProofAction,
  rejectQrPaymentAction,
} from '@/app/(admin)/admin/payments/actions';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { PriorBookingDepositsInfoBlock } from '@/src/components/admin/PriorBookingDepositsInfoBlock';
import { paiseToInr } from '@/src/lib/format';

/** @deprecated Use OperationsPaymentReviewsPanel — kept for PG collections inline review. */
export function AdminPendingPaymentsPanel({
  items,
}: {
  items: PendingPaymentReviewItem[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partialOpenKey, setPartialOpenKey] = useState<string | null>(null);
  const [depositDueDate, setDepositDueDate] = useState('');

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
        case 'deposit_link':
          result = await approveDepositLinkProofAction(item.entityId, item.pgId);
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

  async function onPartialApprove(item: PendingPaymentReviewItem) {
    if (!depositDueDate) {
      setError('Pick a deposit due date.');
      return;
    }
    setBusyKey(item.key);
    setError(null);
    try {
      const result = await approvePartialQrPaymentAction(
        item.entityId,
        item.pgId,
        depositDueDate,
      );
      if (!result.ok) {
        setError(result.message ?? 'Partial approval failed.');
        return;
      }
      setPartialOpenKey(null);
      setDepositDueDate('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Partial approval failed.');
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
      {items.map((item) => {
        const review = item.bookingPaymentReview;
        const showPartial = item.kind === 'qr' && review?.canPartialApprove;
        return (
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
                  {item.paymentTypeLabel}
                </span>
                <span className="text-xs text-zinc-500">{item.pgName}</span>
              </div>
              <h3 className="mt-1 font-semibold text-zinc-900">{item.title}</h3>
              <p className="text-sm text-zinc-600">{item.subtitle}</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700">
                {paiseToInr(item.amountPaise)}
              </p>

              {review ? (
                <dl className="mt-3 grid gap-1 rounded-lg border border-sky-100 bg-sky-50/80 p-3 text-xs text-zinc-700 sm:grid-cols-2">
                  <div>
                    <dt className="text-zinc-500">Checkout total due</dt>
                    <dd className="font-semibold">{paiseToInr(review.bookingTotalDuePaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Amount submitted</dt>
                    <dd className="font-semibold">{paiseToInr(review.amountSubmittedPaise)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Rent due / paid</dt>
                    <dd>
                      {paiseToInr(review.rentDuePaise)} →{' '}
                      <span className="font-semibold text-emerald-800">
                        {paiseToInr(review.rentPaisePaid)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Deposit due / paid</dt>
                    <dd>
                      {paiseToInr(review.depositCashDuePaise)} →{' '}
                      <span className="font-semibold text-emerald-800">
                        {paiseToInr(review.depositPaisePaid)}
                      </span>
                      {review.depositDuePaise > 0 ? (
                        <span className="text-amber-800">
                          {' '}
                          · balance {paiseToInr(review.depositDuePaise)}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {item.priorBookingDeposits?.length ? (
                <div className="mt-3">
                  <PriorBookingDepositsInfoBlock
                    deposits={item.priorBookingDeposits}
                    variant="light"
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {showPartial && partialOpenKey !== item.key ? (
                  <>
                    <button
                      type="button"
                      disabled={busyKey === item.key}
                      onClick={() => {
                        setPartialOpenKey(item.key);
                        setError(null);
                        const d = new Date();
                        d.setDate(d.getDate() + 14);
                        setDepositDueDate(d.toISOString().slice(0, 10));
                      }}
                      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Approve partial deposit
                    </button>
                    <button
                      type="button"
                      disabled={busyKey === item.key}
                      onClick={() => void onApprove(item)}
                      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Require full payment
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busyKey === item.key}
                    onClick={() => void onApprove(item)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busyKey === item.key ? 'Working…' : 'Approve payment'}
                  </button>
                )}
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

              {partialOpenKey === item.key && review ? (
                <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-sky-900">
                    Partial deposit move-in — {paiseToInr(review.depositPaisePaid)} collected now,{' '}
                    {paiseToInr(review.depositDuePaise)} due later
                  </p>
                  <label className="mt-2 block text-xs text-zinc-700">
                    Deposit balance due date
                    <input
                      type="date"
                      value={depositDueDate}
                      onChange={(e) => setDepositDueDate(e.target.value)}
                      className="mt-1 block rounded border border-zinc-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busyKey === item.key}
                      onClick={() => void onPartialApprove(item)}
                      className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Confirm partial approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setPartialOpenKey(null)}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
