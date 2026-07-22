'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';
import { approvePaymentReviewVerificationAction } from '@/app/(admin)/admin/payments/actions';
import { PaymentReviewEssentials } from '@/src/components/admin/operations/PaymentReviewEssentials';
import { PaymentProofRejectionDialog } from '@/src/components/admin/operations/PaymentProofRejectionDialog';
import { PaymentProofRejectionHistory } from '@/src/components/admin/operations/PaymentProofRejectionHistory';
import { useOperationsActionToast } from '@/src/components/admin/operations/OperationsActionToast';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import type { PaymentProofRejectionHistoryRow } from '@/src/services/paymentProofRejectionService';
import { PipelineTestInvoiceBadge } from '@/src/components/admin/PipelineTestInvoiceBadge';
import { InvoiceAdminRowActions } from '@/src/components/admin/InvoiceAdminRowActions';
import { OPS_ORANGE, OPS_PANEL } from '@/src/components/admin/residentOps/residentOpsUi';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { PAYMENT_ALREADY_APPROVED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';

function formatUploadTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '—';
  }
}

function formatBillingMonth(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 7);
}

export function OperationsPaymentReviewsPanel({
  items,
  reviewMode = true,
  rejectionHistory = [],
}: {
  items: PendingPaymentReviewItem[];
  reviewMode?: boolean;
  rejectionHistory?: PaymentProofRejectionHistoryRow[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [moreOpenKey, setMoreOpenKey] = useState<string | null>(null);
  const [rejectDialogItem, setRejectDialogItem] = useState<PendingPaymentReviewItem | null>(
    null,
  );
  const { showToast, toastNode } = useOperationsActionToast();

  const visibleItems = useMemo(() => {
    if (!reviewMode || items.length <= 1) return items;
    return [items[0]];
  }, [items, reviewMode]);

  function advanceAfterAction(
    _currentKey: string,
    nextKey?: string | null,
    opts?: { rejected?: boolean },
  ) {
    setRejectDialogItem(null);
    setMoreOpenKey(null);
    if (opts?.rejected) {
      showToast('Payment rejected successfully.');
    }
    startTransition(() => {
      if (reviewMode && nextKey) {
        router.push(
          `/admin/operations?filter=waiting_for_approval&focus=${encodeURIComponent(nextKey)}`,
        );
        return;
      }
      router.replace(operationsFilterHref('waiting_for_approval'));
    });
  }

  async function handleApprove(item: PendingPaymentReviewItem) {
    setBusyKey(item.key);
    setError(null);
    setInfo(null);
    try {
      const result = await approvePaymentReviewVerificationAction(
        item.kind,
        item.entityId,
        item.pgId,
        undefined,
        item.key,
      );
      if (!result.ok) {
        setError(result.message ?? 'Approval failed.');
        return;
      }
      if ('message' in result && result.message === PAYMENT_ALREADY_APPROVED_MESSAGE) {
        setInfo(result.message);
      }
      advanceAfterAction(item.key, result.nextKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusyKey(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-8 text-center">
        <p className="text-sm text-apg-silver">
          No payment screenshots awaiting review. When residents upload proof, they appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toastNode}
      {rejectDialogItem ? (
        <PaymentProofRejectionDialog
          item={rejectDialogItem}
          open
          onClose={() => setRejectDialogItem(null)}
          onRejected={({ nextKey }) =>
            void advanceAfterAction(rejectDialogItem.key, nextKey, { rejected: true })
          }
        />
      ) : null}
      {reviewMode && items.length > 0 ? (
        <p className="text-sm text-apg-silver">
          <span className="font-semibold text-white">{items.length}</span> pending
          {items.length === 1 ? '' : ' — approve or reject to open the next automatically'}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {info ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {info}
        </p>
      ) : null}

      {visibleItems.map((item) => {
        const busy = busyKey === item.key;

        return (
          <article
            key={item.key}
            className="flex flex-col overflow-hidden rounded-2xl border border-white/10"
            style={{ backgroundColor: OPS_PANEL }}
          >
            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:gap-8">
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {item.isPipelineTest ? <PipelineTestInvoiceBadge /> : null}
                  <h3 className="text-base font-semibold text-white">{item.residentName}</h3>
                  <span className="text-xs text-apg-silver">
                    {item.bookingCode ?? item.title}
                  </span>
                </div>

                <PaymentReviewEssentials item={item} />

                {moreOpenKey === item.key ? (
                  <dl className="grid gap-3 text-xs text-apg-silver sm:grid-cols-2">
                    {item.invoiceNumber ? (
                      <div>
                        <dt className="uppercase tracking-wide">Invoice</dt>
                        <dd className="mt-0.5 font-medium text-white">{item.invoiceNumber}</dd>
                      </div>
                    ) : null}
                    {item.billingMonth ? (
                      <div>
                        <dt className="uppercase tracking-wide">Billing month</dt>
                        <dd className="mt-0.5 font-medium text-white">
                          {formatBillingMonth(item.billingMonth)}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="uppercase tracking-wide">Submitted</dt>
                      <dd className="mt-0.5 font-medium text-white">
                        {formatUploadTime(item.proofSubmittedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-wide">Category</dt>
                      <dd className="mt-0.5 font-medium text-white">{item.paymentTypeLabel}</dd>
                    </div>
                    {item.referenceNumber ? (
                      <div className="sm:col-span-2">
                        <dt className="uppercase tracking-wide">Reference</dt>
                        <dd className="mt-0.5 font-medium text-white">{item.referenceNumber}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                {moreOpenKey === item.key ? (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-[#121820]/80 p-4 text-xs">
                    <div className="flex flex-wrap gap-3">
                      {item.customerId ? (
                        <Link
                          href={`/admin/residents/${item.customerId}`}
                          className="font-medium text-[#FF5A1F] hover:underline"
                        >
                          Resident profile
                        </Link>
                      ) : null}
                      {item.bookingId ? (
                        <Link
                          href={`/admin/bookings/${item.bookingId}/financial`}
                          className="font-medium text-[#FF5A1F] hover:underline"
                        >
                          Booking financials
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="lg:sticky lg:top-4 lg:self-start">
                <PaymentScreenshotPreview
                  url={item.screenshotUrl}
                  viewHref={adminPaymentProofViewUrl(item.kind, item.entityId)}
                  alt={`${item.residentName} payment proof`}
                  variant="review"
                />
              </div>
            </div>

            {rejectionHistory.length > 0 ? (
              <div className="border-t border-white/10 px-5 py-4">
                <PaymentProofRejectionHistory rows={rejectionHistory} />
              </div>
            ) : null}

            <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#141820] px-5 py-4">
              {item.financialInvoiceId &&
              (item.kind === 'rent' || item.kind === 'electricity') ? (
                <InvoiceAdminRowActions financialInvoiceId={item.financialInvoiceId} />
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleApprove(item)}
                className="min-w-[160px] rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                style={{ backgroundColor: OPS_ORANGE }}
              >
                {busy ? 'Working…' : 'Approve'}
              </button>

              {item.canReject ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRejectDialogItem(item);
                    setError(null);
                  }}
                  className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  Reject
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setMoreOpenKey(moreOpenKey === item.key ? null : item.key)}
                className="ml-auto rounded-lg border border-white/15 px-3 py-2 text-sm text-apg-silver hover:bg-white/5"
              >
                {moreOpenKey === item.key ? 'Less' : 'More'}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
