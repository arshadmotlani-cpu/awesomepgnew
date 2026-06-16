'use client';

import { useActionState } from 'react';
import { runFinancialRecalcAction, type RecalcActionState } from './actions';

const initial: RecalcActionState = { status: 'idle' };

export function RecalculateFinancialForm({ billingMonth }: { billingMonth: string }) {
  const [state, action, pending] = useActionState(runFinancialRecalcAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="billingMonth" value={billingMonth} />
      <p className="text-xs text-apg-silver">
        Reconciles unified invoices, marks overdue deposits, and refreshes SSOT aggregates.
        Use only when totals look stale after manual fixes.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e04e18] disabled:opacity-50"
      >
        {pending ? 'Recalculating…' : 'Recalculate financial data'}
      </button>
      {state.status === 'ok' ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          <p>{state.message}</p>
          {state.detail ? <p className="mt-1 text-xs text-emerald-300/90">{state.detail}</p> : null}
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {state.message}
        </div>
      ) : null}
    </form>
  );
}
