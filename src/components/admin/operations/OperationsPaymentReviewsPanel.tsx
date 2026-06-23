'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { OPS_ORANGE, OPS_PANEL } from '@/src/components/admin/residentOps/residentOpsUi';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import type { OverpaymentDisposition, PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { formatDate, paiseToInr } from '@/src/lib/format';

const OVERPAYMENT_OPTIONS: Array<{ value: OverpaymentDisposition; label: string }> = [
  { value: 'wallet_credit', label: 'Credit to wallet' },
  { value: 'future_adjustment', label: 'Future adjustment' },
  { value: 'refund_later', label: 'Refund later' },
];

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function FinancialBlock({ item }: { item: PendingPaymentReviewItem }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-[#121820] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">Expected</p>
        <ul className="mt-2 space-y-1 text-sm text-white">
          {item.expectedLines.map((line) => (
            <li key={line.label} className="flex justify-between gap-3">
              <span className="text-apg-silver">{line.label}</span>
              <span className="font-medium">{paiseToInr(line.amountPaise)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-white/10 pt-2 text-sm font-semibold text-white">
          Total {paiseToInr(item.expectedTotalPaise)}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#121820] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">Received</p>
        <p className="mt-2 text-2xl font-semibold text-emerald-300">
          {item.receivedPaise != null ? paiseToInr(item.receivedPaise) : 'Not declared'}
        </p>
        {item.receivedPaise == null ? (
          <p className="mt-1 text-xs text-apg-silver">Verify amount on screenshot before approving.</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#121820] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
          {item.overpaidPaise > 0 ? 'Overpaid' : 'After approval'}
        </p>
        {item.overpaidPaise > 0 ? (
          <p className="mt-2 text-2xl font-semibold text-sky-300">{paiseToInr(item.overpaidPaise)}</p>
        ) : (
          <p className="mt-2 text-sm font-medium text-amber-200">{item.outstandingSummary}</p>
        )}
      </div>
    </div>
  );
}

export function OperationsPaymentReviewsPanel({
  items,
}: {
  items: PendingPaymentReviewItem[];
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

  async function onApprove(item: PendingPaymentReviewItem) {
    if (item.overpaidPaise > 0 && !overpayDisposition) {
      setError('Choose how to handle the overpayment.');
      return;
    }
    setBusyKey(item.key);
    setError(null);
    try {
      let result: { ok: boolean; message?: string };
      switch (item.kind) {
        case 'qr':
          result = await approveQrPaymentAction(item.entityId, item.pgId, {
            overpaymentDisposition: item.overpaidPaise > 0 ? overpayDisposition : undefined,
            reviewNotes: reviewNotes.trim() || undefined,
            approvalNotes: approvalNotes.trim() || undefined,
          });
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
    setBusyKey(item.key);
    setError(null);
    try {
      let result: { ok: boolean; message?: string } = { ok: true };
      switch (item.kind) {
        case 'qr':
          await rejectQrPaymentAction(item.entityId, item.pgId);
          break;
        case 'rent':
          result = await rejectRentProofAction(item.entityId, item.pgId);
          break;
        case 'electricity':
          result = await rejectElectricityProofAction(item.entityId, item.pgId);
          break;
        case 'extension':
          result = await rejectExtensionProofAction(item.entityId, item.pgId);
          break;
        case 'deposit_link':
          result = await rejectDepositLinkProofAction(item.entityId, item.pgId);
          break;
      }
      if (!result.ok) {
        setError(result.message ?? 'Rejection failed.');
        return;
      }
      router.refresh();
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
      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {items.map((item) => {
        const review = item.bookingPaymentReview;
        const showPartial = item.canPartialApprove;
        const busy = busyKey === item.key;
        const details = item.bookingDetails;

        return (
          <article
            key={item.key}
            className="rounded-2xl border border-white/10 p-5"
            style={{ backgroundColor: OPS_PANEL }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
                style={{ backgroundColor: `${OPS_ORANGE}33`, color: OPS_ORANGE }}
              >
                {item.paymentTypeLabel}
              </span>
              <span className="text-xs text-apg-silver">{item.pgName}</span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white">{item.residentName}</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetaRow label="Phone" value={item.phone} />
                  <MetaRow label="Booking code" value={item.bookingCode} />
                  <MetaRow label="PG" value={item.pgName} />
                  <MetaRow label="Room" value={item.roomNumber} />
                  <MetaRow label="Bed" value={item.bedCode} />
                </dl>

                {details ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-[#121820] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
                      Booking details
                    </p>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <MetaRow label="Move-in" value={details.moveInDate ? formatDate(details.moveInDate) : null} />
                      <MetaRow
                        label="Move-out"
                        value={details.moveOutDate ? formatDate(details.moveOutDate) : null}
                      />
                      <MetaRow label="Duration" value={details.durationLabel} />
                      <MetaRow label="Room type" value={details.roomType} />
                      <MetaRow label="Bed" value={details.bedCode} />
                      <MetaRow
                        label="Monthly rent"
                        value={
                          details.monthlyRentPaise != null
                            ? paiseToInr(details.monthlyRentPaise)
                            : null
                        }
                      />
                      <MetaRow
                        label="Deposit required"
                        value={
                          details.depositRequiredPaise != null
                            ? paiseToInr(details.depositRequiredPaise)
                            : null
                        }
                      />
                    </dl>
                  </div>
                ) : null}

                <FinancialBlock item={item} />

                <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-[#121820]/80 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
                    Admin review (operations only)
                  </p>
                  <p className="mt-1 text-xs text-apg-silver">
                    Not shown on resident invoices — audit trail for staff.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-apg-silver">
                      Review notes
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-2 py-1.5 text-sm text-white"
                        placeholder="What does this payment cover?"
                      />
                    </label>
                    <label className="block text-xs text-apg-silver">
                      Approval notes
                      <textarea
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f1318] px-2 py-1.5 text-sm text-white"
                        placeholder="Decision rationale"
                      />
                    </label>
                  </div>
                  {item.overpaidPaise > 0 ? (
                    <label className="mt-3 block text-xs text-apg-silver">
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
                </div>
              </div>

              <PaymentScreenshotPreview
                url={item.screenshotUrl}
                viewHref={adminPaymentProofViewUrl(item.kind, item.entityId)}
                alt={`${item.residentName} payment proof`}
                className="h-48 w-full rounded-xl border border-white/10 object-contain bg-black/40"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
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
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    Approve partial
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onApprove(item)}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    style={{ backgroundColor: OPS_ORANGE }}
                  >
                    {busy ? 'Working…' : 'Approve'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onApprove(item)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundColor: OPS_ORANGE }}
                >
                  {busy ? 'Working…' : 'Approve'}
                </button>
              )}

              {item.canReject ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onReject(item)}
                  className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  Reject
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setMoreOpenKey(moreOpenKey === item.key ? null : item.key)}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-apg-silver hover:bg-white/5"
              >
                More
              </button>
            </div>

            {partialOpenKey === item.key && review ? (
              <div className="mt-3 rounded-xl border border-sky-400/30 bg-sky-500/10 p-3">
                <p className="text-xs font-semibold text-sky-100">
                  Partial deposit move-in — {paiseToInr(review.depositPaisePaid)} collected now,{' '}
                  {paiseToInr(review.depositDuePaise)} due later
                </p>
                <label className="mt-2 block text-xs text-apg-silver">
                  Deposit balance due date
                  <input
                    type="date"
                    value={depositDueDate}
                    onChange={(e) => setDepositDueDate(e.target.value)}
                    className="mt-1 block rounded-lg border border-white/10 bg-[#0f1318] px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onPartialApprove(item)}
                    className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    Confirm partial approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartialOpenKey(null)}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-apg-silver"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {moreOpenKey === item.key ? (
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <a
                  href={adminPaymentProofViewUrl(item.kind, item.entityId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                  style={{ color: OPS_ORANGE }}
                >
                  Open screenshot
                </a>
                {item.customerId ? (
                  <Link
                    href={`/admin/residents/${item.customerId}`}
                    className="font-medium hover:underline"
                    style={{ color: OPS_ORANGE }}
                  >
                    Resident profile
                  </Link>
                ) : null}
                {item.bookingId ? (
                  <Link
                    href={`/admin/bookings/${item.bookingId}`}
                    className="font-medium hover:underline"
                    style={{ color: OPS_ORANGE }}
                  >
                    Booking
                  </Link>
                ) : null}
                {showPartial ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onApprove(item)}
                    className="font-medium hover:underline"
                    style={{ color: OPS_ORANGE }}
                  >
                    Require full payment instead
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
