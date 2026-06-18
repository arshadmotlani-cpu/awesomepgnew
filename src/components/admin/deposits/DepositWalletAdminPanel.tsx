'use client';

import { useActionState } from 'react';
import {
  cancelDepositInvoiceAction,
  editDepositSummaryAction,
  rebuildDepositWalletAction,
  type DepositWalletActionState,
} from '@/app/(admin)/admin/deposits/[bookingId]/deposit-wallet-actions';
import type { UnifiedDepositView } from '@/src/services/depositOperations';
import { paiseToInr } from '@/src/lib/format';

const idle: DepositWalletActionState = { status: 'idle' };

export function DepositWalletAdminPanel({
  view,
  isFrozen,
}: {
  view: UnifiedDepositView;
  isFrozen: boolean;
}) {
  const [editState, editAction, editPending] = useActionState(editDepositSummaryAction, idle);
  const [rebuildState, rebuildAction, rebuildPending] = useActionState(
    rebuildDepositWalletAction,
    idle,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelDepositInvoiceAction,
    idle,
  );

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
            Deposit wallet
          </h2>
          <p className="mt-1 text-xs text-apg-silver">
            Unified view — ledger is source of truth for collected, deducted, and refundable.
          </p>
        </div>
        {view.invoiceStatus ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-apg-silver">
            {view.invoiceStatus}
          </span>
        ) : null}
      </div>

      {!view.walletInSync && view.walletMismatchReason ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Deposit wallet out of sync. {view.walletMismatchReason}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat label="Required" value={paiseToInr(view.requiredPaise)} />
        <Stat label="Collected" value={paiseToInr(view.collectedPaise)} accent="emerald" />
        <Stat label="Refundable" value={paiseToInr(view.refundablePaise)} accent="strong" />
        <Stat label="Deductions" value={paiseToInr(view.deductedPaise)} />
        <Stat label="Refunded" value={paiseToInr(view.refundedPaise)} />
        <Stat label="Due" value={paiseToInr(view.depositDuePaise)} />
      </dl>

      {!isFrozen ? (
        <>
          <form action={editAction} className="grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-3 sm:grid-cols-2">
            <input type="hidden" name="bookingId" value={view.bookingId} />
            <label className="text-sm">
              <span className="text-apg-silver">Required deposit (₹)</span>
              <input
                name="requiredInr"
                type="number"
                min="0"
                step="1"
                placeholder={(view.requiredPaise / 100).toString()}
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
                placeholder={(view.collectedPaise / 100).toString()}
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
                disabled={editPending}
                className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {editPending ? 'Saving…' : 'Save deposit corrections'}
              </button>
              {editState.status === 'ok' ? (
                <p className="mt-2 text-xs text-emerald-300">{editState.message}</p>
              ) : null}
              {editState.status === 'error' ? (
                <p className="mt-2 text-xs text-rose-300">{editState.message}</p>
              ) : null}
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <form action={rebuildAction}>
              <input type="hidden" name="bookingId" value={view.bookingId} />
              <button
                type="submit"
                disabled={rebuildPending}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5 disabled:opacity-60"
              >
                {rebuildPending ? 'Rebuilding…' : 'Rebuild deposit wallet'}
              </button>
            </form>
            <form action={cancelAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="bookingId" value={view.bookingId} />
              <label className="text-xs">
                <span className="text-apg-silver">Type CANCEL to void invoice</span>
                <input
                  name="confirmText"
                  required
                  placeholder="CANCEL"
                  className="apg-admin-field mt-1 block rounded-lg border border-white/10 bg-[#12161C] px-2 py-1 text-white"
                />
              </label>
              <button
                type="submit"
                disabled={cancelPending}
                className="rounded-lg border border-rose-400/40 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
              >
                {cancelPending ? 'Cancelling…' : 'Cancel deposit invoice'}
              </button>
            </form>
          </div>
          {rebuildState.status === 'ok' ? (
            <p className="text-xs text-emerald-300">{rebuildState.message}</p>
          ) : null}
          {rebuildState.status === 'error' ? (
            <p className="text-xs text-rose-300">{rebuildState.message}</p>
          ) : null}
          {cancelState.status === 'ok' ? (
            <p className="text-xs text-emerald-300">{cancelState.message}</p>
          ) : null}
          {cancelState.status === 'error' ? (
            <p className="text-xs text-rose-300">{cancelState.message}</p>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-apg-silver">This deposit is settled and frozen.</p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'strong';
}) {
  const cls =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'strong'
        ? 'text-white font-semibold'
        : 'text-white';
  return (
    <div className="rounded-lg border border-white/10 bg-[#12161C] p-3">
      <dt className="text-[10px] uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd className={`mt-1 text-sm tabular-nums ${cls}`}>{value}</dd>
    </div>
  );
}
