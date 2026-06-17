'use client';

import { useActionState } from 'react';
import {
  fixHarishDepositAction,
  previewFinancialResetAction,
  runFinancialResetAction,
  type FinancialResetActionState,
} from '@/app/(admin)/admin/settings/financial-reset-actions';

const idle: FinancialResetActionState = { status: 'idle' };

export function ProductionFinancialResetPanel() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewFinancialResetAction,
    idle,
  );
  const [resetState, resetAction, resetPending] = useActionState(runFinancialResetAction, idle);
  const [harishState, harishAction, harishPending] = useActionState(fixHarishDepositAction, idle);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
        <h3 className="text-sm font-semibold text-rose-100">Full financial clean start</h3>
        <p className="mt-2 text-sm text-rose-100/90">
          Resets <strong className="text-white">all</strong> financial data to zero — revenue,
          deposits, rent, electricity, refunds, payment records, and billing action items. The
          system behaves like a fresh install. Re-enter real invoices and deposits manually
          afterward.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-rose-100/80">
          <li>Deletes all deposit ledger + settlement rows</li>
          <li>Cancels every rent, electricity, and financial invoice</li>
          <li>Removes PG payment records and invalidates payment links</li>
          <li>Resets booking deposit/refund status fields</li>
          <li>Clears billing action items and occupancy placeholders</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={previewAction}>
            <button
              type="submit"
              disabled={previewPending}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
            >
              {previewPending ? 'Previewing…' : 'Preview clean start'}
            </button>
          </form>
          <form action={resetAction}>
            <button
              type="submit"
              disabled={resetPending}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
            >
              {resetPending ? 'Resetting…' : 'Run full financial clean start'}
            </button>
          </form>
        </div>
        {previewState.status === 'ok' ? (
          <p className="mt-3 text-xs text-rose-50">{previewState.message}</p>
        ) : null}
        {resetState.status === 'ok' ? (
          <p className="mt-3 text-sm text-emerald-300">{resetState.message}</p>
        ) : null}
        {resetState.status === 'error' || previewState.status === 'error' ? (
          <p className="mt-3 text-sm text-rose-300">
            {resetState.status === 'error'
              ? resetState.message
              : previewState.status === 'error'
                ? previewState.message
                : null}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
        <h3 className="text-sm font-semibold text-white">Harish — Shantinagar Room 203 B5</h3>
        <p className="mt-2 text-sm text-apg-silver">
          After clean start, use this to set verified ₹1,500 deposit + vacating penalty only.
        </p>
        <form action={harishAction} className="mt-4">
          <button
            type="submit"
            disabled={harishPending}
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {harishPending ? 'Fixing…' : 'Fix Harish deposit wallet'}
          </button>
        </form>
        {harishState.status === 'ok' ? (
          <p className="mt-3 text-sm text-emerald-300">{harishState.message}</p>
        ) : null}
        {harishState.status === 'error' ? (
          <p className="mt-3 text-sm text-rose-300">{harishState.message}</p>
        ) : null}
      </div>
    </div>
  );
}
