'use client';

import { useActionState } from 'react';
import {
  adminCancelBookingAction,
  recordOfflinePaymentAction,
  type AdminCancelState,
  type AdminRecordPaymentState,
} from '@/app/(admin)/admin/bookings/[bookingId]/actions';

const idleCancel: AdminCancelState = { status: 'idle' };
const idleRecord: AdminRecordPaymentState = { status: 'idle' };

function formatPaise(p: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(p / 100);
}

export function AdminCancelForm({ bookingCode }: { bookingCode: string }) {
  const [state, formAction, pending] = useActionState(
    adminCancelBookingAction,
    idleCancel,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="bookingCode" value={bookingCode} />
      <textarea
        name="reason"
        required
        rows={2}
        minLength={3}
        placeholder="Why is this booking being cancelled?"
        className="block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Cancelling…' : 'Cancel booking'}
      </button>
      {state.status === 'error' ? (
        <p className="text-xs text-rose-700">{state.message}</p>
      ) : state.status === 'cancelled' ? (
        <p className="text-xs text-emerald-700">
          Cancelled · refund tier <strong>{state.tier}</strong> ·{' '}
          {formatPaise(state.refundPaise)} queued. Refresh to see updated rows.
        </p>
      ) : null}
    </form>
  );
}

export function RecordOfflinePaymentForm({
  bookingCode,
  defaultAmountRupees,
}: {
  bookingCode: string;
  defaultAmountRupees: number;
}) {
  const [state, formAction, pending] = useActionState(
    recordOfflinePaymentAction,
    idleRecord,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="bookingCode" value={bookingCode} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Provider
          </span>
          <select
            name="provider"
            defaultValue="cash"
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="cash">Cash</option>
            <option value="upi_manual">UPI (manual)</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Amount (₹)
          </span>
          <input
            type="number"
            name="amountRupees"
            min="1"
            step="1"
            defaultValue={defaultAmountRupees}
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Confirmed received (₹)
          </span>
          <input
            type="number"
            name="confirmedReceivedRupees"
            min="0"
            step="1"
            defaultValue={defaultAmountRupees}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Rent allocated (₹)
          </span>
          <input
            type="number"
            name="rentAllocatedRupees"
            min="0"
            step="1"
            defaultValue={0}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Deposit allocated (₹)
          </span>
          <input
            type="number"
            name="depositAllocatedRupees"
            min="0"
            step="1"
            defaultValue={0}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm shadow-sm"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Reference (receipt # / UPI ref / NEFT id)
        </span>
        <input
          name="reference"
          type="text"
          placeholder="Optional"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Recording…' : 'Record offline payment'}
      </button>
      {state.status === 'error' ? (
        <p className="text-xs text-rose-700">{state.message}</p>
      ) : state.status === 'success' ? (
        <p className="text-xs text-emerald-700">
          Recorded {formatPaise(state.amountPaise)}. Refresh to see the new payment row.
        </p>
      ) : null}
    </form>
  );
}
