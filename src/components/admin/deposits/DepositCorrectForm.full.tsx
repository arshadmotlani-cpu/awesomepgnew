'use client';

import { useActionState } from 'react';
import {
  editDepositSummaryAction,
  type DepositWalletActionState,
} from '@/app/(admin)/admin/deposits/deposit-wallet-actions';
import {
  sanitizeUnifiedDepositView,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { asPlainNumber } from '@/src/lib/format';

const idle: DepositWalletActionState = { status: 'idle' };

export function DepositCorrectForm({ view }: { view: UnifiedDepositView }) {
  const v = sanitizeUnifiedDepositView(view);
  const [state, action, pending] = useActionState(editDepositSummaryAction, idle);

  const requiredPlaceholder = (asPlainNumber(v.requiredPaise) / 100).toString();
  const collectedPlaceholder = (asPlainNumber(v.collectedPaise) / 100).toString();

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold text-white">Correct deposit</h2>
      <p className="mt-1 text-xs text-apg-silver">
        Update the required or collected deposit amount when records need fixing.
      </p>

      <form
        action={action}
        className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-4 sm:grid-cols-2"
      >
        <input type="hidden" name="bookingId" value={v.bookingId} />
        <label className="text-sm">
          <span className="text-apg-silver">Required deposit (₹)</span>
          <input
            name="requiredInr"
            type="number"
            min="0"
            step="1"
            placeholder={requiredPlaceholder}
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-apg-silver">Collected deposit (₹)</span>
          <input
            name="collectedInr"
            type="number"
            min="0"
            step="1"
            placeholder={collectedPlaceholder}
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <label className="sm:col-span-2 text-sm">
          <span className="text-apg-silver">Reason</span>
          <input
            name="reason"
            required
            placeholder="Why are you correcting this deposit?"
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save corrections'}
          </button>
          {state.status === 'ok' ? (
            <p className="mt-2 text-xs text-emerald-300">{state.message}</p>
          ) : null}
          {state.status === 'error' ? (
            <p className="mt-2 text-xs text-rose-300">{state.message}</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
