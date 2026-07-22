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
import { paiseToInr, asPlainNumber } from '@/src/lib/format';
import { adminMoneyInputClassName, bindAdminMoneyInput } from '@/src/components/admin/AdminMoneyInput';

type ServerAction = (
  bookingId: string,
  prev: ActionState,
  formData: FormData,
) => Promise<ActionState>;

/** Ledger reconcile — for Advanced Tools only. */
export function DepositLedgerReconcileForm({
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
  const defaultValueInr = Math.round(asPlainNumber(bookingDepositPaise) / 100);

  return (
    <div className="rounded-xl border border-white/10 bg-[#12161C] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
        Reconcile ledger to booking deposit
      </h3>
      <p className="mt-1 text-xs text-apg-silver/80">
        Removes all existing deposit ledger rows (collections, deductions, refunds) and records one
        clean collection at the amount you enter. Use to fix duplicate entries or erroneous charges.
      </p>
      <p className="mt-2 text-xs text-apg-silver">
        Booking deposit: <strong className="text-white">{paiseToInr(bookingDepositPaise)}</strong>
        {' · '}
        Ledger collected: <strong className="text-white">{paiseToInr(ledgerCollectedPaise)}</strong>
        {websiteDepositPaise > 0 ? (
          <>
            {' · '}
            Reference rate (current bed pricing):{' '}
            <strong className="text-white">{paiseToInr(websiteDepositPaise)}</strong>
          </>
        ) : null}
      </p>
      <form action={runAction} className="mt-3 space-y-3">
        <label className="block text-sm">
          <span className="text-apg-silver">Total deposit collected (₹)</span>
          <input
            {...bindAdminMoneyInput()}
            name="amountInr"
            required
            defaultValue={defaultValueInr}
            className={`apg-admin-field mt-1 block w-full max-w-xs rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white ${adminMoneyInputClassName}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-apg-silver">Reason</span>
          <input
            type="text"
            name="reason"
            required
            maxLength={200}
            placeholder="e.g. grandfathered deposit before price increase"
            className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Set deposit & reconcile ledger'}
        </button>
        {state.status === 'ok' ? (
          <p className="text-xs text-emerald-300">{state.message}</p>
        ) : state.status === 'error' ? (
          <p className="text-xs text-rose-300">{state.message}</p>
        ) : null}
      </form>
    </div>
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
      ? 'text-emerald-300'
      : accent === 'warn'
        ? 'text-rose-300'
        : 'text-white';

  return (
    <form
      action={runAction}
      className="space-y-3 rounded-xl border border-white/10 bg-[#1A1F27] p-4"
    >
      <div>
        <h3 className={`text-sm font-semibold ${headerColor}`}>{title}</h3>
        <p className="mt-1 text-xs text-apg-silver">{helper}</p>
      </div>
      <label className="block text-sm">
        <span className="text-apg-silver">Amount (₹)</span>
        <input
          {...bindAdminMoneyInput({ allowDecimal: true })}
          name="amountInr"
          required
          className={`apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white ${adminMoneyInputClassName}`}
        />
      </label>
      {showPaymentMethod ? (
        <label className="block text-sm">
          <span className="text-apg-silver">Payment method</span>
          <select
            name="paymentMethod"
            className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
            defaultValue="cash"
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </label>
      ) : null}
      <label className="block text-sm">
        <span className="text-apg-silver">Reason</span>
        <input
          type="text"
          name="reason"
          required
          maxLength={200}
          placeholder="e.g. broken cupboard"
          className="apg-admin-field mt-1 block w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#FF5A1F] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
      {state.status === 'ok' ? (
        <p className="text-xs text-emerald-300">{state.message}</p>
      ) : state.status === 'error' ? (
        <p className="text-xs text-rose-300">{state.message}</p>
      ) : null}
    </form>
  );
}

export function DepositAdjustForms({
  bookingId,
}: {
  bookingId: string;
  bookingDepositPaise?: number;
  ledgerCollectedPaise?: number;
  websiteDepositPaise?: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <DepositForm
        title="Collect deposit"
        helper="Record cash, UPI, or bank transfer received from the resident."
        bookingId={bookingId}
        action={addDepositAction}
        submitLabel="Record collection"
        accent="positive"
        minAmount="0.01"
        showPaymentMethod
      />
      <DepositForm
        title="Charge against deposit"
        helper="Deduct for damage, unpaid rent, or other agreed charges."
        bookingId={bookingId}
        action={deductDepositAction}
        submitLabel="Record charge"
        accent="warn"
        minAmount="0.01"
      />
      <DepositForm
        title="Refund deposit"
        helper="Record money returned to the resident."
        bookingId={bookingId}
        action={refundDepositAction}
        submitLabel="Record refund"
        accent="neutral"
        minAmount="0.01"
      />
    </div>
  );
}
