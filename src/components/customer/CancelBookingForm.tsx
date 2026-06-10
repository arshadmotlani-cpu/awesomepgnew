'use client';

import { useActionState } from 'react';
import {
  cancelBookingAction,
  type CancelActionState,
} from '@/app/(customer)/booking/[bookingCode]/actions';

const idle: CancelActionState = { status: 'idle' };

function formatPaise(p: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(p / 100);
}

/**
 * Cancellation form rendered on the confirmation page when the booking is
 * still cancellable (status pending_payment | confirmed). The dialog is
 * intentionally simple — a textarea + a confirm button — because the
 * refund tier is computed server-side from the snapshotted policy and the
 * actual cancel time, not from anything the user can edit.
 */
export function CancelBookingForm({ bookingCode }: { bookingCode: string }) {
  const [state, formAction, pending] = useActionState(cancelBookingAction, idle);

  if (state.status === 'cancelled') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Booking cancelled.</p>
        <p className="mt-1">
          Tier: <span className="font-mono">{state.tier}</span> ·
          cancelled {Math.round(state.hoursBefore)}h before check-in.
        </p>
        <p className="mt-1">
          Refund queued:{' '}
          <span className="font-semibold">{formatPaise(state.refundPaise)}</span>.
        </p>
        <p className="mt-2 text-xs text-emerald-800">
          Refresh the page to see the booking status update.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingCode" value={bookingCode} />
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Reason for cancellation
        </span>
        <textarea
          name="reason"
          required
          minLength={3}
          rows={2}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Change of plans, found another place, etc."
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Cancelling…' : 'Cancel booking'}
      </button>
      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
