'use client';

import { useActionState } from 'react';
import {
  addDepositAction,
  deductDepositAction,
  refundDepositAction,
  correctDepositAction,
  initialActionState,
  type ActionState,
} from '@/app/(admin)/admin/deposits/[bookingId]/actions';
import { paiseToInr } from '@/src/lib/format';

/**
 * Deposit-ledger forms for the admin per-booking deposit page.
 */
export function DepositAdjustForms({
  bookingId,
  bookingDepositPaise,
  ledgerCollectedPaise,
  websiteDepositPaise,
}: {
  bookingId: string;
  bookingDepositPaise: number;
  ledgerCollectedPaise: number;
  websiteDepositPaise?: number;
}) {
  return (
    <div className="space-y-4">
      <CorrectDepositForm
        bookingId={bookingId}
        bookingDepositPaise={bookingDepositPaise}
        ledgerCollectedPaise={ledgerCollectedPaise}
        websiteDepositPaise={websiteDepositPaise ?? 0}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <DepositForm
          title="Add deposit"
          helper="Record cash, UPI, or bank transfer. Updates wallet, reports, and revenue."
          bookingId={bookingId}
          action={addDepositAction}
          submitLabel="Add to ledger"
          accent="positive"
          minAmount="0.01"
          showPaymentMethod
        />
        <DepositForm
          title="Deduct"
          helper="Damage charge, unpaid rent, etc. Reason becomes the audit-log entry."
          bookingId={bookingId}
          action={deductDepositAction}
          submitLabel="Record deduction"
          accent="warn"
          minAmount="0.01"
        />
        <DepositForm
          title="Refund"
          helper="Record a deposit refund issued back to the resident."
          bookingId={bookingId}
          action={refundDepositAction}
          submitLabel="Record refund"
          accent="neutral"
          minAmount="0.01"
        />
      </div>
    </div>
  );
}

type ServerAction = (
  bookingId: string,
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

function CorrectDepositForm({
  bookingId,
  bookingDepositPaise,
  ledgerCollectedPaise,
  websiteDepositPaise,
}: {
  bookingId: string;
  bookingDepositPaise: number;
  ledgerCollectedPaise: number;
  websiteDepositPaise: number;
}) {
  const bound = correctDepositAction.bind(null, bookingId);
  const [state, runAction, pending] = useActionState(bound, initialActionState);

  return (
    <form
      action={runAction}
      className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm"
    >
      <div>
        <h3 className="text-sm font-semibold text-indigo-900">Set / correct deposit collected</h3>
        <p className="mt-1 text-[11px] text-indigo-900/80">
          Sets the booking deposit and reconciles the ledger to this total. Use for grandfathered
          amounts or fixing a wrong entry after assignment.
        </p>
        <p className="mt-1 text-[11px] text-zinc-600">
          Current booking deposit: <strong>{paiseToInr(bookingDepositPaise)}</strong>
          {' · '}
          Ledger collected: <strong>{paiseToInr(ledgerCollectedPaise)}</strong>
          {websiteDepositPaise > 0 ? (
            <>
              {' · '}
              Website default: <strong>{paiseToInr(websiteDepositPaise)}</strong>
            </>
          ) : null}
        </p>
      </div>
      <label className="block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Total deposit collected (₹)
        </span>
        <input
          type="number"
          name="amountInr"
          min="0"
          step="1"
          required
          defaultValue={Math.round(bookingDepositPaise / 100)}
          className="mt-1 block w-full max-w-xs rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
          placeholder="e.g. grandfathered deposit before price increase"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800 disabled:bg-indigo-300"
      >
        {pending ? 'Saving…' : 'Set deposit & reconcile ledger'}
      </button>
      {state.status === 'ok' ? (
        <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{state.message}</p>
      ) : state.status === 'error' ? (
        <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{state.message}</p>
      ) : null}
    </form>
  );
}

function DepositForm({
  title,
  helper,
  bookingId,
  action,
  submitLabel,
  accent,
  minAmount,
  showPaymentMethod = false,
}: {
  title: string;
  helper: string;
  bookingId: string;
  action: ServerAction;
  submitLabel: string;
  accent: 'positive' | 'warn' | 'neutral';
  minAmount: string;
  showPaymentMethod?: boolean;
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
          min={minAmount}
          step="0.01"
          required
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      {showPaymentMethod ? (
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Payment method
          </span>
          <select
            name="paymentMethod"
            className="mt-1 block w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm"
            defaultValue="cash"
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </label>
      ) : null}
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
