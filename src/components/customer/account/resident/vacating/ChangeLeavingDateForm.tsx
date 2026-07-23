'use client';

import { useState, useTransition } from 'react';
import { formatDate, paiseToInr } from '@/src/lib/format';
import {
  previewVacatingDateChangeAction,
  submitVacatingDateChangeAction,
  cancelVacatingDateChangeRequestAction,
} from '@/app/(customer)/account/resident/vacating-date-change-actions';
import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';
import { ResidentEstimatedSettlementBreakdown } from '@/src/components/customer/account/resident/vacating/ResidentEstimatedSettlementBreakdown';

export function ChangeLeavingDateForm({
  bookingId,
  currentVacatingDate,
  pendingRequestId,
  onSubmitted,
}: {
  bookingId: string;
  currentVacatingDate: string;
  pendingRequestId?: string | null;
  onSubmitted?: () => void;
}) {
  const [newDate, setNewDate] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<VacatingDateChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (pendingRequestId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Date change awaiting admin approval</p>
        <p className="mt-1 text-amber-900/80">
          The office is reviewing your new leaving date. You will see the updated estimate here after
          approval.
        </p>
        <button
          type="button"
          disabled={pending}
          className="mt-3 text-xs font-medium text-amber-900 underline"
          onClick={() =>
            startTransition(async () => {
              const res = await cancelVacatingDateChangeRequestAction(pendingRequestId);
              if (!res.ok) setError(res.error ?? 'Could not cancel.');
              else onSubmitted?.();
            })
          }
        >
          Withdraw date change request
        </button>
        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Change leaving date</h3>
      <p className="mt-1 text-xs text-zinc-600">
        Current date: {formatDate(currentVacatingDate)}. The new date must still satisfy the 14-day
        notice rule from when you submitted notice.
      </p>
      <label className="mt-3 block text-xs font-medium text-zinc-700">
        New leaving date
        <input
          type="date"
          value={newDate}
          onChange={(e) => {
            setNewDate(e.target.value);
            setPreview(null);
            setError(null);
          }}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <label className="mt-3 block text-xs font-medium text-zinc-700">
        Note for admin (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !newDate}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await previewVacatingDateChangeAction(bookingId, newDate);
              if (!res.ok || !res.preview) {
                setError(res.ok ? 'Could not preview.' : res.error);
                setPreview(null);
                return;
              }
              setPreview(res.preview);
            })
          }
        >
          Preview refund impact
        </button>
        <button
          type="button"
          disabled={pending || !preview}
          className="rounded-lg bg-apg-orange px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await submitVacatingDateChangeAction(bookingId, newDate, notes);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              onSubmitted?.();
            })
          }
        >
          Submit for admin approval
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      {preview ? (
        <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
          <p className="text-sm font-medium text-zinc-900">
            {formatDate(preview.currentVacatingDate)} → {formatDate(preview.requestedVacatingDate)}
          </p>
          <p className="text-sm text-zinc-700">{preview.refundDeltaLabel}</p>
          <p className="text-xs text-zinc-500">
            Current estimate {paiseToInr(preview.currentEstimatedRefundPaise)} → New estimate{' '}
            {paiseToInr(preview.requestedEstimatedRefundPaise)}
          </p>
          <ResidentEstimatedSettlementBreakdown preview={preview.requestedEstimatedSettlement} />
        </div>
      ) : null}
    </div>
  );
}
