'use client';

import { useActionState } from 'react';
import {
  addDepositAction,
  deductDepositAction,
  refundDepositAction,
  initialActionState,
  type ActionState,
} from '@/app/(admin)/admin/deposits/[bookingId]/actions';

/**
 * Three append-only deposit-ledger forms for the admin per-booking
 * deposit page. Each form is wrapped around the corresponding service
 * function. Reason is required so the audit trail captures *why*.
 */
export function DepositAdjustForms({ bookingId }: { bookingId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <DepositForm
        title="Add deposit"
        helper="Record an additional deposit collected from the resident (e.g. top-up)."
        bookingId={bookingId}
        action={addDepositAction}
        submitLabel="Add to ledger"
        accent="positive"
      />
      <DepositForm
        title="Deduct"
        helper="Damage charge, unpaid rent, etc. Reason becomes the audit-log entry."
        bookingId={bookingId}
        action={deductDepositAction}
        submitLabel="Record deduction"
        accent="warn"
      />
      <DepositForm
        title="Refund"
        helper="Record a deposit refund issued back to the resident."
        bookingId={bookingId}
        action={refundDepositAction}
        submitLabel="Record refund"
        accent="neutral"
      />
    </div>
  );
}

type ServerAction = (
  bookingId: string,
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

function DepositForm({
  title,
  helper,
  bookingId,
  action,
  submitLabel,
  accent,
}: {
  title: string;
  helper: string;
  bookingId: string;
  action: ServerAction;
  submitLabel: string;
  accent: 'positive' | 'warn' | 'neutral';
}) {
  const bound = action.bind(null, bookingId);
  const [state, runAction, pending] = useActionState(bound, initialActionState);
  const headerColor =
    accent === 'positive'
      ? 'text-emerald-700'
      : accent === 'warn'
        ? 'text-rose-700'
        : 'text-zinc-700';
  return (
    <form
      action={runAction}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <div>
        <h3 className={`text-sm font-semibold ${headerColor}`}>{title}</h3>
        <p className="mt-1 text-[11px] text-zinc-500">{helper}</p>
      </div>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Amount (₹)
        </span>
        <input
          type="number"
          name="amountInr"
          min="0.01"
          step="0.01"
          required
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Reason
        </span>
        <input
          type="text"
          name="reason"
          required
          maxLength={200}
          placeholder="e.g. broken cupboard"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
      {state.status === 'ok' ? (
        <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
          {state.message}
        </p>
      ) : state.status === 'error' ? (
        <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
