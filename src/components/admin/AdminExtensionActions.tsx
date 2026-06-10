'use client';

import { useActionState } from 'react';
import { defaultExtensionUntilDate } from '@/src/lib/dateDefaults';
import {
  adminCancelExtensionAction,
  adminRequestExtensionAction,
  recordOfflineExtensionPaymentAction,
  type AdminCancelExtensionState,
  type AdminRecordExtensionPaymentState,
  type AdminRequestExtensionState,
} from '@/app/(admin)/admin/bookings/[bookingId]/actions';

const idleReq: AdminRequestExtensionState = { status: 'idle' };
const idleCancel: AdminCancelExtensionState = { status: 'idle' };
const idleRec: AdminRecordExtensionPaymentState = { status: 'idle' };

function formatPaise(p: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(p / 100);
}

export function AdminRequestExtensionForm({
  bookingCode,
  currentCheckout,
}: {
  bookingCode: string;
  /** YYYY-MM-DD. Used as the lower bound for the date picker. */
  currentCheckout: string;
}) {
  const [state, formAction, pending] = useActionState(
    adminRequestExtensionAction,
    idleReq,
  );
  const minUntil = (() => {
    const d = new Date(currentCheckout + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const defaultUntil = defaultExtensionUntilDate(currentCheckout);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="bookingCode" value={bookingCode} />
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          New check-out date
        </span>
        <input
          type="date"
          name="newUntilDate"
          required
          min={minUntil}
          defaultValue={defaultUntil}
          className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Duration mode
        </span>
        <select
          name="durationMode"
          defaultValue="daily"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {pending ? 'Reserving…' : 'Request extension'}
      </button>
      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {state.message}
        </p>
      ) : null}
      {state.status === 'conflict' ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">{state.message}</p>
          {state.conflicts.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {state.conflicts.map((c, i) => (
                <li key={`${c.bedId}-${i}`}>
                  Bed{' '}
                  <span className="font-mono">{c.bedCode}</span> booked through{' '}
                  {c.blockingUntil}
                  {c.blockingBookingCode
                    ? ` (booking ${c.blockingBookingCode})`
                    : ''}
                  .
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.status === 'created' ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200">
          Extension reserved · quote {formatPaise(state.quotedTotalPaise)}.
          Pay via the &quot;Record offline payment&quot; form on this card OR
          send the customer to{' '}
          <code>/booking/{state.bookingCode}/extend/{state.extensionId}/pay</code>.
        </p>
      ) : null}
    </form>
  );
}

export function AdminCancelExtensionForm({
  extensionId,
}: {
  extensionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    adminCancelExtensionAction,
    idleCancel,
  );
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="extensionId" value={extensionId} />
      <input
        type="text"
        name="reason"
        placeholder="reason (optional)"
        className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Cancelling…' : 'Cancel ext.'}
      </button>
      {state.status === 'error' ? (
        <span className="text-xs text-rose-700">{state.message}</span>
      ) : null}
    </form>
  );
}

export function AdminRecordOfflineExtensionPaymentForm({
  extensionId,
  amountPaise,
}: {
  extensionId: string;
  amountPaise: number;
}) {
  const [state, formAction, pending] = useActionState(
    recordOfflineExtensionPaymentAction,
    idleRec,
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="extensionId" value={extensionId} />
      <select
        name="provider"
        defaultValue="cash"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      >
        <option value="cash">Cash</option>
        <option value="upi_manual">UPI (manual)</option>
        <option value="bank_transfer">Bank transfer</option>
      </select>
      <input
        type="text"
        name="reference"
        placeholder="reference"
        className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {pending ? 'Recording…' : `Mark paid (${formatPaise(amountPaise)})`}
      </button>
      {state.status === 'error' ? (
        <span className="text-xs text-rose-700">{state.message}</span>
      ) : null}
    </form>
  );
}
