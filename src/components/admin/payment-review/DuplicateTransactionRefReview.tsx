'use client';

import { useState } from 'react';
import {
  DUPLICATE_TXN_REF_OVERRIDE_MIN_REASON_LENGTH,
  DUPLICATE_TXN_REF_WARNING_TITLE,
  validateDuplicateTransactionRefOverrideReason,
  type DuplicateTransactionRefReviewContextEnriched,
} from '@/src/lib/payments/duplicateTransactionRefOverride';
import { paiseToInr } from '@/src/lib/format';

function formatApprovedAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return iso;
  }
}

export function DuplicateTransactionRefWarningBanner({
  context,
}: {
  context: DuplicateTransactionRefReviewContextEnriched;
}) {
  if (!context.requiresOverride) return null;

  return (
    <section
      className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5"
      data-duplicate-txn-ref-warning
    >
      <h2 className="text-base font-semibold text-amber-100">{DUPLICATE_TXN_REF_WARNING_TITLE}</h2>
      <p className="mt-2 text-sm text-amber-50/90">
        This transaction ID is already associated with another approved payment. Review the existing
        payment below before using Approve anyway.
      </p>
      {context.conflicts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {context.conflicts.map((c) => (
            <li
              key={`${c.sourceKind}:${c.sourceId}`}
              className="rounded-lg border border-amber-400/20 bg-[#121820]/80 p-3 text-sm"
            >
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-amber-200/80">Payment ID</dt>
                  <dd className="mt-0.5 font-mono text-xs text-white">{c.paymentId}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-amber-200/80">Purpose</dt>
                  <dd className="mt-0.5 text-white">{c.purposeLabel}</dd>
                </div>
                {c.residentName ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-amber-200/80">Resident</dt>
                    <dd className="mt-0.5 text-white">{c.residentName}</dd>
                  </div>
                ) : null}
                {c.bookingCode ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-amber-200/80">Booking</dt>
                    <dd className="mt-0.5 text-white">{c.bookingCode}</dd>
                  </div>
                ) : null}
                {c.amountPaise != null ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-amber-200/80">Amount</dt>
                    <dd className="mt-0.5 tabular-nums text-white">{paiseToInr(c.amountPaise)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs uppercase tracking-wide text-amber-200/80">Approved</dt>
                  <dd className="mt-0.5 text-white">{formatApprovedAt(c.approvedAt)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function DuplicateTransactionRefOverrideDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleSubmit() {
    const check = validateDuplicateTransactionRefOverrideReason(reason);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    onConfirm(check.reason);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-labelledby="duplicate-override-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-xl">
        <h2 id="duplicate-override-title" className="text-lg font-semibold text-white">
          Approve despite duplicate transaction ID?
        </h2>
        <p className="mt-2 text-sm text-apg-silver">
          Only continue if you have verified this is a separate legitimate payment that happens to
          share the same bank reference.
        </p>
        <label className="mt-4 block text-sm font-medium text-white">
          Reason for override
          <textarea
            className="mt-2 w-full rounded-lg border border-white/15 bg-[#121820] px-3 py-2 text-sm text-white placeholder:text-apg-silver"
            rows={4}
            value={reason}
            disabled={busy}
            placeholder={`At least ${DUPLICATE_TXN_REF_OVERRIDE_MIN_REASON_LENGTH} characters`}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-apg-silver hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSubmit}
            className="rounded-lg bg-apg-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Approving…' : 'Confirm approve anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
