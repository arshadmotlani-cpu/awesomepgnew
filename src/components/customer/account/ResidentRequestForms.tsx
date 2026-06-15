'use client';

import { useActionState } from 'react';
import {
  submitDepositRefundRequestAction,
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

  return (
    <div className="grid gap-4">
      {hasOpenVacating ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          You have a vacating notice on file. To continue living here, ask admin to{' '}
          <strong>cancel your notice</strong> — your tenancy continues on the same booking with no
          duplicate records.
        </div>
      ) : null}

      <form action={refundAction} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <h4 className="text-sm font-semibold text-zinc-900">Request deposit refund</h4>
        <p className="mt-1 text-xs text-zinc-600">
          Available balance: ₹{(refundableBalancePaise / 100).toLocaleString('en-IN')}. Admin
          reviews deductions (electricity, damage, etc.) and processes within 24 hours after dues
          are cleared.
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
    </div>
  );
}
