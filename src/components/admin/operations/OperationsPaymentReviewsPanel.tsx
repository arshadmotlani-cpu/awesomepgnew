'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';
import {
  approveElectricityProofAction,
  approveDepositLinkProofAction,
  approveExtensionProofAction,
  approveQrPaymentWithAllocationAction,
  approveQrPaymentAction,
  approveRentProofAction,
  getBookingMoneyBalancesForReviewAction,
} from '@/app/(admin)/admin/payments/actions';
import { PaymentAllocationDialog } from '@/src/components/admin/operations/PaymentAllocationDialog';
import type { PaymentAllocationSubmit } from '@/src/components/admin/operations/PaymentAllocationDialog';
import type { BookingMoneyBalances } from '@/src/lib/billing/bookingMoneyBalances';
import { PaymentApprovalConfirmDialog } from '@/src/components/admin/operations/PaymentApprovalConfirmDialog';
import { PaymentBreakdownSection } from '@/src/components/admin/operations/PaymentBreakdownSection';
import { PaymentProofRejectionDialog } from '@/src/components/admin/operations/PaymentProofRejectionDialog';
import { PaymentProofRejectionHistory } from '@/src/components/admin/operations/PaymentProofRejectionHistory';
import { useOperationsActionToast } from '@/src/components/admin/operations/OperationsActionToast';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import type { PaymentProofRejectionHistoryRow } from '@/src/services/paymentProofRejectionService';
import { PipelineTestInvoiceBadge } from '@/src/components/admin/PipelineTestInvoiceBadge';
import { InvoiceAdminRowActions } from '@/src/components/admin/InvoiceAdminRowActions';
import { OPS_ORANGE, OPS_PANEL } from '@/src/components/admin/residentOps/residentOpsUi';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { buildPaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type {
  OverpaymentDisposition,
  PendingPaymentReviewItem,
} from '@/src/lib/operations/paymentReviewTypes';
import { PAYMENT_ALREADY_APPROVED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { paiseToInr } from '@/src/lib/format';

const OVERPAYMENT_OPTIONS: Array<{ value: OverpaymentDisposition; label: string }> = [
  { value: 'allocate_deposit', label: 'Apply remainder to deposit' },
  { value: 'allocate_rent', label: 'Apply remainder to rent' },
  { value: 'allocate_electricity', label: 'Apply remainder to electricity' },
  { value: 'advance_credit', label: 'Advance credit' },
  { value: 'refund_later', label: 'Refund later' },
];

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
  const [allocationItem, setAllocationItem] = useState<PendingPaymentReviewItem | null>(null);
  const [allocationBalances, setAllocationBalances] = useState<BookingMoneyBalances | null>(null);
  const [allocationBalancesLoading, setAllocationBalancesLoading] = useState(false);
  const [allocationBalancesError, setAllocationBalancesError] = useState<string | null>(null);
  const [moreOpenKey, setMoreOpenKey] = useState<string | null>(null);
  const [overpayDisposition, setOverpayDisposition] =
    useState<OverpaymentDisposition>('allocate_deposit');
  const [reviewNotes, setReviewNotes] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectDialogItem, setRejectDialogItem] = useState<PendingPaymentReviewItem | null>(
    null,
  );
  const [confirmItem, setConfirmItem] = useState<PendingPaymentReviewItem | null>(null);
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
    setConfirmItem(null);
    setAllocationItem(null);
    setAllocationBalances(null);
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

  function requestApprove(item: PendingPaymentReviewItem) {
    if (item.overpaidPaise > 0 && !overpayDisposition) {
      setError('Choose how to handle the overpayment.');
      return;
    }
    setError(null);
    setConfirmItem(item);
  }

  async function onApprove(item: PendingPaymentReviewItem) {
    if (item.overpaidPaise > 0 && !overpayDisposition) {
      setError('Choose how to handle the overpayment.');
      return;
    }
    setBusyKey(item.key);
    setError(null);
    setInfo(null);
    try {
      let result: { ok: boolean; message?: string; nextKey?: string | null };
      switch (item.kind) {
        case 'qr':
          result = await approveQrPaymentAction(
            item.entityId,
            item.pgId,
            {
              overpaymentDisposition:
                item.overpaidPaise > 0 ? overpayDisposition : undefined,
              reviewNotes: reviewNotes.trim() || undefined,
              approvalNotes: approvalNotes.trim() || undefined,
            },
            item.key,
          );
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
      if ('message' in result && result.message === PAYMENT_ALREADY_APPROVED_MESSAGE) {
        setInfo(result.message);
      }
      advanceAfterAction(item.key, result.nextKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusyKey(null);
      setConfirmItem(null);
    }
  }

  async function openAllocationDialog(item: PendingPaymentReviewItem) {
    if (!item.bookingId) {
      setError('Booking context missing for allocation.');
      return;
    }
    setAllocationItem(item);
    setAllocationBalances(null);
    setAllocationBalancesError(null);
    setAllocationBalancesLoading(true);
    setError(null);
    try {
      const result = await getBookingMoneyBalancesForReviewAction(item.bookingId);
      if (!result.ok) {
        setAllocationBalancesError(result.message ?? 'Could not load balances.');
        return;
      }
      setAllocationBalances(result.balances);
    } catch (err) {
      setAllocationBalancesError(err instanceof Error ? err.message : 'Could not load balances.');
    } finally {
      setAllocationBalancesLoading(false);
    }
  }

  async function onAllocationApprove(item: PendingPaymentReviewItem, alloc: PaymentAllocationSubmit) {
    setBusyKey(item.key);
    setError(null);
    setInfo(null);
    try {
      const result = await approveQrPaymentWithAllocationAction(
        item.entityId,
        item.pgId,
        {
          confirmedReceivedPaise: alloc.confirmedReceivedPaise,
          rentAllocatedPaise: alloc.rentAllocatedPaise,
          depositAllocatedPaise: alloc.depositAllocatedPaise,
          electricityAllocatedPaise: alloc.electricityAllocatedPaise,
          otherAllocatedPaise: alloc.otherAllocatedPaise,
          depositDueDate: alloc.depositDueDate,
          allocationNotes: alloc.allocationNotes,
        },
        {
          overpaymentDisposition: alloc.overpaymentDisposition,
          reviewNotes: reviewNotes.trim() || undefined,
          approvalNotes: approvalNotes.trim() || undefined,
        },
        item.key,
      );
      if (!result.ok) {
        setError(result.message ?? 'Allocation approval failed.');
        return;
      }
      if ('message' in result && result.message === PAYMENT_ALREADY_APPROVED_MESSAGE) {
        setInfo(result.message);
      }
      advanceAfterAction(item.key, result.nextKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Allocation approval failed.');
    } finally {
      setBusyKey(null);
      setAllocationItem(null);
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

  const confirmBreakdown = confirmItem ? buildPaymentReviewBreakdown(confirmItem) : null;

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
      {confirmItem && confirmBreakdown ? (
        <PaymentApprovalConfirmDialog
          open
          residentName={confirmItem.residentName}
          breakdown={confirmBreakdown}
          pending={busyKey === confirmItem.key}
          onCancel={() => setConfirmItem(null)}
          onConfirm={() => void onApprove(confirmItem)}
        />
      ) : null}
      {allocationItem ? (
        <PaymentAllocationDialog
          open
          residentName={allocationItem.residentName}
          submittedAmountPaise={
            allocationItem.submittedAmountPaise ?? allocationItem.amountPaise
          }
          balances={allocationBalances}
          balancesLoading={allocationBalancesLoading}
          balancesError={allocationBalancesError}
          pending={busyKey === allocationItem.key}
          onClose={() => {
            setAllocationItem(null);
            setAllocationBalances(null);
            setAllocationBalancesError(null);
          }}
          onSubmit={(alloc) => void onAllocationApprove(allocationItem, alloc)}
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
        const isBookingQr = item.kind === 'qr' && Boolean(item.bookingId && item.bookingPaymentReview);
        const busy = busyKey === item.key;
        const breakdown = buildPaymentReviewBreakdown(item);

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

                <PaymentBreakdownSection breakdown={breakdown} />

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
                    <dd className="mt-0.5 font-medium text-white">
                      {breakdown.paymentCategoryLabel}
                    </dd>
                  </div>
                </dl>

                {item.referenceNumber ? (
                  <p className="text-xs text-apg-silver">
                    Reference: <span className="text-white">{item.referenceNumber}</span>
                  </p>
                ) : null}

                {moreOpenKey === item.key ? (
                  <div className="space-y-3 rounded-xl border border-white/10 bg-[#121820]/80 p-4 text-xs">
                    {item.outstandingSummary ? (
                      <p className="text-apg-silver">{item.outstandingSummary}</p>
                    ) : null}
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
                          href={`/admin/bookings/${item.bookingId}`}
                          className="font-medium text-[#FF5A1F] hover:underline"
                        >
                          Booking
                        </Link>
                      ) : null}
                    </div>
                    {item.overpaidPaise > 0 ? (
                      <label className="block text-apg-silver">
                        Overpayment handling ({paiseToInr(item.overpaidPaise)} extra)
                        <select
                          value={overpayDisposition}
                          onChange={(e) =>
                            setOverpayDisposition(e.target.value as OverpaymentDisposition)
                          }
                          className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-2 py-2 text-sm text-white"
                        >
                          {OVERPAYMENT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="block text-apg-silver">
                      Review notes (internal)
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-2 py-1.5 text-sm text-white"
                      />
                    </label>
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
              {isBookingQr ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openAllocationDialog(item)}
                  className="min-w-[160px] rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundColor: OPS_ORANGE }}
                >
                  {busy ? 'Working…' : 'Approve with allocation'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => requestApprove(item)}
                  className="min-w-[120px] rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundColor: OPS_ORANGE }}
                >
                  {busy ? 'Working…' : 'Approve'}
                </button>
              )}

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
