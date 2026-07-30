'use client';

import { useActionState } from 'react';
import {
  closeDailyRegisterAction,
  saveDailyClosingOpeningFloatAction,
  type DailyClosingActionState,
} from '@/src/hair/actions/financialDashboard';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { DailyClosingSnapshot } from '@/src/hair/services/financialDashboard';

const initial: DailyClosingActionState = {};

function MethodLine({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-fyh-text-muted">{label}</span>
      <span className="tabular-nums font-medium text-fyh-text">{formatInrFromPaise(paise)}</span>
    </div>
  );
}

export function DailyClosingPanel({ closing }: { closing: DailyClosingSnapshot }) {
  const [openState, openAction, openPending] = useActionState(
    saveDailyClosingOpeningFloatAction,
    initial,
  );
  const [closeState, closeAction, closePending] = useActionState(closeDailyRegisterAction, initial);

  const openingRupees = (closing.openingFloatPaise / 100).toFixed(0);
  const expectedCashRupees = (closing.expectedCashDrawerPaise / 100).toFixed(0);

  return (
    <section className="fyh-glass space-y-4 p-4">
      <div>
        <h2 className="fyh-display text-lg font-semibold">Daily Closing</h2>
        <p className="text-xs text-fyh-text-muted">
          {closing.dayKey} · register reconciliation
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fyh-text-muted">
            Opening float
          </p>
          <p className="fyh-display text-xl font-semibold text-fyh-accent">
            {formatInrFromPaise(closing.openingFloatPaise)}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-fyh-text-muted">
            Expected cash drawer
          </p>
          <p className="fyh-display text-xl font-semibold text-fyh-text">
            {formatInrFromPaise(closing.expectedCashDrawerPaise)}
          </p>
          <p className="text-xs text-fyh-text-muted">Opening + cash collected today</p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-fyh-text-muted">
          Collections today
        </p>
        <MethodLine label="Cash" paise={closing.collectionsByMethod.cash} />
        <MethodLine label="UPI" paise={closing.collectionsByMethod.upi} />
        <MethodLine label="Card" paise={closing.collectionsByMethod.card} />
        <div className="border-t border-[color:var(--fyh-border)] pt-2">
          <MethodLine label="Total collected" paise={closing.totalCollectionsPaise} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-3">
          <p className="text-xs text-fyh-text-muted">Due collected</p>
          <p className="fyh-display mt-1 text-lg font-semibold text-fyh-text">
            {formatInrFromPaise(closing.dueCollectedPaise)}
          </p>
        </div>
        <div className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-3">
          <p className="text-xs text-fyh-text-muted">Advance issued</p>
          <p className="fyh-display mt-1 text-lg font-semibold text-fyh-text">
            {formatInrFromPaise(closing.advanceIssuedPaise)}
          </p>
        </div>
      </div>

      <form action={openAction} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-fyh-text-muted">Set opening float (₹)</span>
          <input
            type="number"
            name="openingFloatRupees"
            min={0}
            step={1}
            defaultValue={openingRupees}
            className="fyh-input w-36"
          />
        </label>
        <button type="submit" disabled={openPending} className="fyh-btn-secondary">
          {openPending ? 'Saving…' : 'Save float'}
        </button>
        {openState.error ? <p className="text-sm text-red-400">{openState.error}</p> : null}
        {openState.success ? <p className="text-sm text-fyh-accent">{openState.success}</p> : null}
      </form>

      <form action={closeAction} className="flex flex-wrap items-end gap-3 border-t border-[color:var(--fyh-border)] pt-4">
        <label className="grid gap-1 text-sm">
          <span className="text-fyh-text-muted">Cash on hand at close (₹)</span>
          <input
            type="number"
            name="closingCashRupees"
            min={0}
            step={1}
            defaultValue={expectedCashRupees}
            className="fyh-input w-36"
          />
        </label>
        <button type="submit" disabled={closePending} className="fyh-btn-primary">
          {closePending ? 'Closing…' : 'Close day'}
        </button>
        {closeState.error ? <p className="text-sm text-red-400">{closeState.error}</p> : null}
        {closeState.success ? <p className="text-sm text-fyh-accent">{closeState.success}</p> : null}
      </form>
    </section>
  );
}
