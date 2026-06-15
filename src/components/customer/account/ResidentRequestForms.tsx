'use client';

import { useActionState } from 'react';
import {
  submitDepositRefundRequestAction,
  submitStayExtensionRequestAction,
  type RequestActionState,
} from '@/app/(customer)/account/resident/request-actions';

const idle: RequestActionState = { ok: false };

export function ResidentRequestForms({
  bookingId,
  refundableBalancePaise,
  hasOpenVacating,
}: {
  bookingId: string;
  refundableBalancePaise: number;
  hasOpenVacating: boolean;
}) {
  const [refundState, refundAction, refundPending] = useActionState(
    submitDepositRefundRequestAction,
    idle,
  );
  const [extState, extAction, extPending] = useActionState(
    submitStayExtensionRequestAction,
    idle,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form action={refundAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <h4 className="text-sm font-semibold text-zinc-900">Request deposit refund</h4>
        <p className="mt-1 text-xs text-zinc-600">
          Available balance: ₹{(refundableBalancePaise / 100).toLocaleString('en-IN')}. Admin
          reviews and processes within 24 hours after dues are cleared.
        </p>
        <label className="mt-3 block text-xs font-medium text-zinc-700">
          Notes (optional)
          <textarea
            name="notes"
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            placeholder="Bank details or reason…"
          />
        </label>
        {refundState.error ? (
          <p className="mt-2 text-xs text-rose-600">{refundState.error}</p>
        ) : null}
        {refundState.ok ? (
          <p className="mt-2 text-xs text-emerald-700">Refund request submitted — track status below.</p>
        ) : null}
        <button
          type="submit"
          disabled={refundPending || refundableBalancePaise <= 0}
          className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {refundPending ? 'Submitting…' : 'Request refund'}
        </button>
      </form>

      <form action={extAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <h4 className="text-sm font-semibold text-zinc-900">Request extension</h4>
        <p className="mt-1 text-xs text-zinc-600">
          {hasOpenVacating
            ? 'You have a vacating notice — admin can extend your vacate date without a new booking.'
            : 'Choose a new end date. Rent and deposit impact are calculated on approval.'}
        </p>
        <label className="mt-3 block text-xs font-medium text-zinc-700">
          New end date
          <input
            type="date"
            name="requestedEndDate"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="mt-2 block text-xs font-medium text-zinc-700">
          Notes (optional)
          <textarea
            name="notes"
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        {extState.error ? <p className="mt-2 text-xs text-rose-600">{extState.error}</p> : null}
        {extState.ok ? (
          <p className="mt-2 text-xs text-emerald-700">Extension request submitted.</p>
        ) : null}
        <button
          type="submit"
          disabled={extPending}
          className="mt-3 rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {extPending ? 'Submitting…' : 'Request extension'}
        </button>
      </form>
    </div>
  );
}
