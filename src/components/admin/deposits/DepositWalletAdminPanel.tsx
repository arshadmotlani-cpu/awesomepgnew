'use client';

/**
 * WALLET BISECT PHASE 3B — header + stats + edit/save form (no previews/rebuild/cancel).
 * Archive: DepositWalletAdminPanel.full.tsx
 */

import { useActionState } from 'react';
import {
  editDepositSummaryAction,
  editDepositSummaryNoRevalidateAction,
  type DepositWalletActionState,
} from '@/app/(admin)/admin/deposits/deposit-wallet-actions';
import {
  sanitizeUnifiedDepositView,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { paiseToInr, asPlainNumber } from '@/src/lib/format';

const BISECT_PHASE = 3;
const idle: DepositWalletActionState = { status: 'idle' };

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

export function DepositWalletAdminPanel({
  view,
  isFrozen,
}: {
  view: UnifiedDepositView;
  isFrozen: boolean;
}) {
  const v = sanitizeUnifiedDepositView(view);
  const [editState, editAction, editPending] = useActionState(editDepositSummaryAction, idle);
  const [editNoRevalState, editNoRevalAction, editNoRevalPending] = useActionState(
    editDepositSummaryNoRevalidateAction,
    idle,
  );

  const requiredPlaceholder = (asPlainNumber(v.requiredPaise) / 100).toString();
  const collectedPlaceholder = (asPlainNumber(v.collectedPaise) / 100).toString();

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-4">
      <p
        data-wallet-bisect={BISECT_PHASE}
        className="rounded border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100"
      >
        Wallet panel bisect-{BISECT_PHASE} — edit/save form
      </p>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
            Deposit wallet
          </h2>
          <p className="mt-1 text-xs text-apg-silver">
            Unified view — ledger is source of truth for collected, deducted, and refundable.
          </p>
        </div>
        {v.invoiceStatus ? (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-apg-silver">
            {v.invoiceStatus}
          </span>
        ) : null}
      </div>

      {!v.walletInSync && v.walletMismatchReason ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Deposit wallet out of sync. {v.walletMismatchReason}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat label="Required" value={paiseToInr(v.requiredPaise)} />
        <Stat label="Collected" value={paiseToInr(v.collectedPaise)} accent="emerald" />
        <Stat label="Refundable" value={paiseToInr(v.refundablePaise)} accent="strong" />
        <Stat label="Deductions" value={paiseToInr(v.deductedPaise)} />
        <Stat label="Refunded" value={paiseToInr(v.refundedPaise)} />
        <Stat label="Due" value={paiseToInr(v.depositDuePaise)} />
      </dl>

      {!isFrozen ? (
        <form
          action={editAction}
          className="grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-3 sm:grid-cols-2"
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
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={editPending || editNoRevalPending}
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {editPending ? 'Saving…' : 'Save deposit corrections'}
            </button>
            <button
              type="submit"
              formAction={editNoRevalAction}
              disabled={editPending || editNoRevalPending}
              className="rounded-lg border border-amber-400/50 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-60"
            >
              {editNoRevalPending ? 'Saving…' : 'Save deposit corrections (no revalidate)'}
            </button>
            {editState.status === 'ok' ? (
              <p className="w-full text-xs text-emerald-300">{editState.message}</p>
            ) : null}
            {editState.status === 'error' ? (
              <p className="w-full text-xs text-rose-300">{editState.message}</p>
            ) : null}
            {editNoRevalState.status === 'ok' ? (
              <p className="w-full text-xs text-emerald-300">{editNoRevalState.message}</p>
            ) : null}
            {editNoRevalState.status === 'error' ? (
              <p className="w-full text-xs text-rose-300">{editNoRevalState.message}</p>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-xs text-apg-silver">This deposit is settled and frozen.</p>
      )}
    </section>
  );
}
