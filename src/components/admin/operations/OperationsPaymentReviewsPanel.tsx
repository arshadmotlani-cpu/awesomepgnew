'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  approveElectricityProofAction,
  approveDepositLinkProofAction,
  approveExtensionProofAction,
  approvePartialQrPaymentAction,
  approveQrPaymentAction,
  approveRentProofAction,
  rejectDepositLinkProofAction,
  rejectElectricityProofAction,
  rejectExtensionProofAction,
  rejectQrPaymentAction,
  rejectRentProofAction,
} from '@/app/(admin)/admin/payments/actions';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import { PipelineTestInvoiceBadge } from '@/src/components/admin/PipelineTestInvoiceBadge';
import { InvoiceAdminRowActions } from '@/src/components/admin/InvoiceAdminRowActions';
import { OPS_ORANGE, OPS_PANEL } from '@/src/components/admin/residentOps/residentOpsUi';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { OverpaymentDisposition, PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { paiseToInr } from '@/src/lib/format';

const OVERPAYMENT_OPTIONS: Array<{ value: OverpaymentDisposition; label: string }> = [
  { value: 'wallet_credit', label: 'Credit to wallet' },
  { value: 'future_adjustment', label: 'Future adjustment' },
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

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

export function OperationsPaymentReviewsPanel({
  items,
  reviewMode = false,
  onCompleted,
}: {
  items: PendingPaymentReviewItem[];
  reviewMode?: boolean;
  onCompleted?: () => void;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partialOpenKey, setPartialOpenKey] = useState<string | null>(null);
  const [depositDueDate, setDepositDueDate] = useState('');
  const [moreOpenKey, setMoreOpenKey] = useState<string | null>(null);
  const [overpayDisposition, setOverpayDisposition] = useState<OverpaymentDisposition>('wallet_credit');
  const [reviewNotes, setReviewNotes] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectOpenKey, setRejectOpenKey] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const visibleItems = useMemo(() => {
    if (!reviewMode || items.length <= 1) return items;
    return [items[0]];
  }, [items, reviewMode]);

  async function advanceAfterAction(_currentKey: string, nextKey?: string | null) {
    setRejectOpenKey(null);
    setRejectReason('');
    setPartialOpenKey(null);
    setMoreOpenKey(null);
    if (onCompleted) {
      onCompleted();
      router.refresh();
      return;
    }
    if (reviewMode && nextKey) {
      router.push(
        `/admin/operations?tab=waiting&item=${encodeURIComponent(nextKey)}&dialog=review`,
      );
    } else {
      router.refresh();
    }
  }

  async function onApprove(item: PendingPaymentReviewItem) {
    if (item.overpaidPaise > 0 && !overpayDisposition) {
      setError('Choose how to handle the overpayment.');
      return;
    }
    setBusyKey(item.key);
    setError(null);
    try {
      let result: { ok: boolean; message?: string; nextKey?: string | null };
      switch (item.kind) {
        case 'qr':
          result = await approveQrPaymentAction(
            item.entityId,
            item.pgId,
            {
              overpaymentDisposition: item.overpaidPaise > 0 ? overpayDisposition : undefined,
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
      await advanceAfterAction(item.key, result.nextKey);
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
        {
          reviewNotes: reviewNotes.trim() || undefined,
          approvalNotes: approvalNotes.trim() || undefined,
        },
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

  async function onReject(item: PendingPaymentReviewItem) {
    const needsReason =
      item.kind === 'rent' || item.kind === 'electricity' || item.kind === 'qr';
    if (needsReason && !rejectReason.trim()) {
      setError('Add a rejection reason for the resident.');
      return;
    }
    setBusyKey(item.key);
    setError(null);
    try {
      let result: { ok: boolean; message?: string; nextKey?: string | null } = { ok: true };
      switch (item.kind) {
        case 'qr':
          result = await rejectQrPaymentAction(
            item.entityId,
            item.pgId,
            rejectReason.trim(),
            item.key,
          );
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
      await advanceAfterAction(item.key, result.nextKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed.');
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

      {visibleItems.map((item) => {
        const review = item.bookingPaymentReview;
        const showPartial = item.canPartialApprove;
        const busy = busyKey === item.key;
        const amountDue =
          item.invoiceAmountPaise != null
            ? paiseToInr(item.invoiceAmountPaise)
            : paiseToInr(item.expectedTotalPaise);
        const amountPaid =
          item.submittedAmountPaise != null ? paiseToInr(item.submittedAmountPaise) : '—';
        const roomBed = [
          item.roomNumber ? `Room ${item.roomNumber}` : null,
          item.bedCode ? `Bed ${item.bedCode}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

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
                  <span className="text-xs text-apg-silver">{item.pgName}</span>
                </div>

                <dl className="grid gap-4 sm:grid-cols-2">
                  <ReviewField label="Resident" value={item.residentName} />
                  <ReviewField label="Room / bed" value={roomBed || '—'} />
                  <ReviewField label="Invoice" value={item.invoiceNumber ?? item.title} />
                  <ReviewField label="Amount due" value={amountDue} />
                  <ReviewField label="Amount paid" value={amountPaid} />
                  <ReviewField label="Invoice type" value={item.paymentTypeLabel} />
                  <ReviewField label="Billing month" value={formatBillingMonth(item.billingMonth)} />
                  <ReviewField label="Submitted" value={formatUploadTime(item.proofSubmittedAt)} />
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
                        Overpayment handling
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

            {rejectOpenKey === item.key ? (
              <div className="border-t border-white/10 px-5 py-4">
                <p className="text-xs font-semibold text-rose-100">Rejection reason (sent to resident)</p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-[#0f1318] px-2 py-1.5 text-sm text-white"
                  placeholder="e.g. Screenshot does not match amount or UPI reference"
                />
              </div>
            ) : null}

            {partialOpenKey === item.key && review ? (
              <div className="border-t border-white/10 px-5 py-4">
                <label className="block text-xs text-apg-silver">
                  Deposit balance due date
                  <input
                    type="date"
                    value={depositDueDate}
                    onChange={(e) => setDepositDueDate(e.target.value)}
                    className="mt-1 block rounded-lg border border-white/10 bg-[#0f1318] px-2 py-1.5 text-sm text-white"
                  />
                </label>
              </div>
            ) : null}

            <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#141820] px-5 py-4">
              {item.financialInvoiceId &&
              (item.kind === 'rent' || item.kind === 'electricity') ? (
                <InvoiceAdminRowActions financialInvoiceId={item.financialInvoiceId} />
              ) : null}
              {showPartial && partialOpenKey !== item.key ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPartialOpenKey(item.key);
                      setError(null);
                      const d = new Date();
                      d.setDate(d.getDate() + 14);
                      setDepositDueDate(d.toISOString().slice(0, 10));
                    }}
                    className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    Approve partial
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onApprove(item)}
                    className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    style={{ backgroundColor: OPS_ORANGE }}
                  >
                    {busy ? 'Working…' : 'Approve'}
                  </button>
                </>
              ) : partialOpenKey === item.key ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onPartialApprove(item)}
                  className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  Confirm partial approve
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onApprove(item)}
                  className="min-w-[120px] rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundColor: OPS_ORANGE }}
                >
                  {busy ? 'Working…' : 'Approve'}
                </button>
              )}

              {item.canReject ? (
                rejectOpenKey === item.key ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onReject(item)}
                    className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    Confirm reject
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setRejectOpenKey(item.key);
                      setRejectReason('');
                      setError(null);
                    }}
                    className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )
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
